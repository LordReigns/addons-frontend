/* eslint-disable jsx-a11y/heading-has-content */
import defaultConfig from 'config';
import makeClassName from 'classnames';
import * as React from 'react';
import PropTypes from 'prop-types';
import { compose } from 'redux';
import Helmet from 'react-helmet';
import { connect } from 'react-redux';
import { withRouter } from 'react-router';

import { setViewContext } from 'amo/actions/viewContext';
import AddAddonToCollection from 'amo/components/AddAddonToCollection';
import AddonBadges from 'amo/components/AddonBadges';
import AddonCompatibilityError from 'amo/components/AddonCompatibilityError';
import AddonMeta from 'amo/components/AddonMeta';
import AddonMoreInfo from 'amo/components/AddonMoreInfo';
import AddonRecommendations from 'amo/components/AddonRecommendations';
import ContributeCard from 'amo/components/ContributeCard';
import AddonsByAuthorsCard from 'amo/components/AddonsByAuthorsCard';
import NotFound from 'amo/components/ErrorPage/NotFound';
import PermissionsCard from 'amo/components/PermissionsCard';
import DefaultRatingManager from 'amo/components/RatingManager';
import ScreenShots from 'amo/components/ScreenShots';
import Link from 'amo/components/Link';
import { getAddonsForSlug } from 'amo/reducers/addonsByAuthors';
import { makeQueryStringWithUTM } from 'amo/utils';
import { fetchAddon, getAddonByID, getAddonBySlug } from 'core/reducers/addons';
import { sendServerRedirect } from 'core/reducers/redirectTo';
import { withFixedErrorHandler } from 'core/errorHandler';
import InstallButton from 'core/components/InstallButton';
import {
  ADDON_TYPE_DICT,
  ADDON_TYPE_EXTENSION,
  ADDON_TYPE_LANG,
  ADDON_TYPE_OPENSEARCH,
  ADDON_TYPE_STATIC_THEME,
  ADDON_TYPE_THEME,
  ADDON_TYPE_THEMES,
  INCOMPATIBLE_NOT_FIREFOX,
  INSTALL_SOURCE_DETAIL_PAGE,
  UNKNOWN,
} from 'core/constants';
import { withInstallHelpers } from 'core/installAddon';
import { nl2br, sanitizeHTML, sanitizeUserHTML } from 'core/utils';
import { getClientCompatibility as _getClientCompatibility } from 'core/utils/compatibility';
import { getAddonIconUrl } from 'core/imageUtils';
import translate from 'core/i18n/translate';
import log from 'core/logger';
import Button from 'ui/components/Button';
import Card from 'ui/components/Card';
import LoadingText from 'ui/components/LoadingText';
import ShowMoreCard from 'ui/components/ShowMoreCard';

import './styles.scss';

// Find out if slug converts to a positive number/ID.
const slugIsPositiveID = (slug) => {
  // eslint-disable-next-line no-restricted-globals
  return !isNaN(slug) && parseInt(slug, 10) > 0;
};

export class AddonBase extends React.Component {
  static propTypes = {
    config: PropTypes.object,
    RatingManager: PropTypes.element,
    addon: PropTypes.object.isRequired,
    clientApp: PropTypes.string.isRequired,
    // This prop is passed in by withInstallHelpers()
    defaultInstallSource: PropTypes.string.isRequired,
    dispatch: PropTypes.func.isRequired,
    errorHandler: PropTypes.object.isRequired,
    getClientCompatibility: PropTypes.func,
    i18n: PropTypes.object.isRequired,
    platformFiles: PropTypes.object,
    lang: PropTypes.string.isRequired,
    // See ReactRouterLocation in 'core/types/router'
    location: PropTypes.object.isRequired,
    params: PropTypes.object.isRequired,
    installStatus: PropTypes.string.isRequired,
    userAgentInfo: PropTypes.object.isRequired,
    addonsByAuthors: PropTypes.array.isRequired,
  };

  static defaultProps = {
    config: defaultConfig,
    RatingManager: DefaultRatingManager,
    platformFiles: {},
    getClientCompatibility: _getClientCompatibility,
  };

  componentWillMount() {
    const {
      addon,
      clientApp,
      dispatch,
      errorHandler,
      lang,
      params,
    } = this.props;

    // This makes sure we do not try to dispatch any new actions in the case
    // of an error.
    if (!errorHandler.hasError()) {
      if (addon) {
        const { slug } = params;

        // We want to make sure the slug converts to a positive
        // number/ID before we try redirecting.
        if (slugIsPositiveID(slug)) {
          // We only load add-ons by slug, but ID must be supported too because
          // it is a legacy behavior.
          dispatch(
            sendServerRedirect({
              status: 301,
              url: `/${lang}/${clientApp}/addon/${addon.slug}/`,
            }),
          );
          return;
        }

        dispatch(setViewContext(addon.type));
      } else {
        dispatch(fetchAddon({ slug: params.slug, errorHandler }));
      }
    }
  }

  componentWillReceiveProps({ addon: newAddon, params: newParams }) {
    const { addon: oldAddon, dispatch, errorHandler, params } = this.props;

    const oldAddonType = oldAddon ? oldAddon.type : null;
    if (newAddon && newAddon.type !== oldAddonType) {
      dispatch(setViewContext(newAddon.type));
    }

    if (params.slug !== newParams.slug) {
      dispatch(fetchAddon({ slug: newParams.slug, errorHandler }));
    }
  }

  addonIsTheme() {
    const { addon } = this.props;
    return addon && ADDON_TYPE_THEMES.includes(addon.type);
  }

  headerImage() {
    const { addon, i18n } = this.props;

    if (this.addonIsTheme()) {
      let previewURL =
        addon.previews.length > 0 && addon.previews[0].image_url
          ? addon.previews[0].image_url
          : null;

      const label = addon
        ? i18n.sprintf(i18n.gettext('Preview of %(title)s'), {
            title: addon.name,
          })
        : '';

      const type = addon ? addon.type : ADDON_TYPE_EXTENSION;

      if (!previewURL && type === ADDON_TYPE_THEME) {
        previewURL = addon.previewURL;
      }

      const headerImage = (
        <img
          alt={label}
          className="Addon-theme-header-image"
          src={previewURL}
        />
      );

      return (
        <div
          className="Addon-theme-header"
          id="Addon-theme-header"
          role="presentation"
        >
          {headerImage}
        </div>
      );
    }

    const iconUrl = getAddonIconUrl(addon);

    return (
      <div className="Addon-icon">
        <img className="Addon-icon-image" alt="" src={iconUrl} />
      </div>
    );
  }

  renderRatingsCard() {
    const { RatingManager, addon, i18n, location } = this.props;
    let content;
    let footerPropName = 'footerText';

    let ratingManager;
    if (addon && addon.current_version) {
      ratingManager = (
        <RatingManager
          addon={addon}
          location={location}
          version={addon.current_version}
        />
      );
    } else {
      ratingManager = (
        <p className="Addon-no-rating-manager">
          {i18n.gettext(`This add-on cannot be rated because no versions
            have been published.`)}
        </p>
      );
    }

    if (addon && addon.ratings.text_count) {
      const count = addon.ratings.text_count;
      const linkText = i18n.sprintf(
        i18n.ngettext(
          'Read %(count)s review',
          'Read all %(count)s reviews',
          count,
        ),
        { count: i18n.formatNumber(count) },
      );

      footerPropName = 'footerLink';
      content = (
        <Link
          className="Addon-all-reviews-link"
          to={`/addon/${addon.slug}/reviews/`}
        >
          {linkText}
        </Link>
      );
    } else if (!addon) {
      content = <LoadingText width={100} />;
    } else {
      content = i18n.gettext('No reviews yet');
    }

    const props = {
      [footerPropName]: (
        <div className="Addon-read-reviews-footer">{content}</div>
      ),
    };
    return (
      <Card
        header={i18n.gettext('Rate your experience')}
        className="Addon-overall-rating"
        {...props}
      >
        {ratingManager}
      </Card>
    );
  }

  renderShowMoreCard() {
    const { addon, i18n } = this.props;

    let title;
    const descriptionProps = {};
    let showAbout = true;

    if (addon) {
      switch (addon.type) {
        case ADDON_TYPE_DICT:
          title = i18n.gettext('About this dictionary');
          break;
        case ADDON_TYPE_EXTENSION:
          title = i18n.gettext('About this extension');
          break;
        case ADDON_TYPE_LANG:
          title = i18n.gettext('About this language pack');
          break;
        case ADDON_TYPE_OPENSEARCH:
          title = i18n.gettext('About this search plugin');
          break;
        case ADDON_TYPE_STATIC_THEME:
        case ADDON_TYPE_THEME:
          title = i18n.gettext('About this theme');
          break;
        default:
          title = i18n.gettext('About this add-on');
      }

      const description = addon.description ? addon.description : addon.summary;
      // For any theme type, we want to hide the summary text here since that is
      // already displayed in the header.
      showAbout =
        ((description === addon.summary &&
          addon.type === ADDON_TYPE_STATIC_THEME) ||
          addon.type === ADDON_TYPE_THEME) === false;

      if (!description || !description.length) {
        return null;
      }
      descriptionProps.dangerouslySetInnerHTML = sanitizeUserHTML(description);
    } else {
      title = <LoadingText width={40} />;
      descriptionProps.children = <LoadingText width={100} />;
    }

    return showAbout ? (
      <ShowMoreCard header={title} className="AddonDescription">
        <div
          className="AddonDescription-contents"
          ref={(ref) => {
            this.addonDescription = ref;
          }}
          {...descriptionProps}
        />
      </ShowMoreCard>
    ) : null;
  }

  renderVersionReleaseNotes() {
    const { addon, i18n } = this.props;
    if (!addon) {
      return null;
    }

    const currentVersion = addon.current_version;
    if (!currentVersion || !currentVersion.release_notes) {
      return null;
    }

    const header = i18n.sprintf(
      i18n.gettext('Release notes for %(addonVersion)s'),
      { addonVersion: currentVersion.version },
    );
    const releaseNotes = sanitizeUserHTML(currentVersion.release_notes);

    /* eslint-disable react/no-danger */
    return (
      <ShowMoreCard className="AddonDescription-version-notes" header={header}>
        <div dangerouslySetInnerHTML={releaseNotes} />
      </ShowMoreCard>
    );
    /* eslint-enable react/no-danger */
  }

  renderAddonsByAuthorsCard({ isForTheme }) {
    const { addon } = this.props;
    const isTheme = this.addonIsTheme();
    if (
      !addon ||
      !addon.authors.length ||
      (isForTheme && !isTheme) ||
      (!isForTheme && isTheme)
    ) {
      return null;
    }

    /* Adding wrapping divs here seems to address what we think is a
      reconcillation issue —— which causes the classname to not always get added
      correctly (e.g.: when the page is refreshed and the addon has
      a description).
      See https://github.com/mozilla/addons-frontend/issues/4744
    */

    return (
      <div>
        <AddonsByAuthorsCard
          addonType={addon.type}
          authorDisplayName={addon.authors[0].name}
          authorUsernames={addon.authors.map((author) => author.username)}
          className="Addon-MoreAddonsCard"
          forAddonSlug={addon.slug}
          numberOfAddons={6}
        />
      </div>
    );
  }

  render() {
    const {
      addon,
      addonsByAuthors,
      clientApp,
      config,
      defaultInstallSource,
      errorHandler,
      getClientCompatibility,
      i18n,
      installStatus,
      userAgentInfo,
    } = this.props;

    const isTheme = this.addonIsTheme();
    let errorBanner = null;
    if (errorHandler.hasError()) {
      log.warn('Captured API Error:', errorHandler.capturedError);

      // 401 and 403 are made to look like a 404 on purpose.
      // See: https://github.com/mozilla/addons-frontend/issues/3061.
      if (
        errorHandler.capturedError.responseStatusCode === 401 ||
        errorHandler.capturedError.responseStatusCode === 403 ||
        errorHandler.capturedError.responseStatusCode === 404
      ) {
        return <NotFound errorCode={errorHandler.capturedError.code} />;
      }

      // Show a list of errors at the top of the add-on section.
      errorBanner = errorHandler.renderError();
    }

    const addonType = addon ? addon.type : ADDON_TYPE_EXTENSION;

    const summaryProps = {};
    let showSummary = false;
    if (addon) {
      // Themes lack a summary so we do the inverse :-/
      // TODO: We should file an API bug about this...
      const summary = addon.summary ? addon.summary : addon.description;

      if (summary && summary.length) {
        summaryProps.dangerouslySetInnerHTML = sanitizeHTML(nl2br(summary), [
          'a',
          'br',
        ]);
        showSummary = true;
      }
    } else {
      summaryProps.children = <LoadingText width={100} />;
      showSummary = true;
    }

    const titleProps = {};
    if (addon) {
      const authorList = addon.authors.map((author) => {
        if (author.url) {
          return `<a href="${author.url}">${author.name}</a>`;
        }

        return author.name;
      });
      const title = i18n.sprintf(
        // translators: Example: The Add-On <span>by The Author</span>
        i18n.gettext('%(addonName)s %(startSpan)sby %(authorList)s%(endSpan)s'),
        {
          addonName: addon.name,
          authorList: authorList.join(', '),
          startSpan: '<span class="Addon-author">',
          endSpan: '</span>',
        },
      );
      titleProps.dangerouslySetInnerHTML = sanitizeHTML(title, ['a', 'span']);
    } else {
      titleProps.children = <LoadingText width={70} />;
    }

    const addonPreviews = addon ? addon.previews : [];

    let isCompatible = false;
    let compatibility;
    if (addon) {
      compatibility = getClientCompatibility({
        addon,
        clientApp,
        userAgentInfo,
      });
      isCompatible = compatibility.compatible;
    }

    const numberOfAddonsByAuthors = addonsByAuthors
      ? addonsByAuthors.length
      : 0;

    const downloadUrl = `https://www.mozilla.org/firefox/new/${makeQueryStringWithUTM(
      {
        utm_content: 'install-addon-button',
      },
    )}`;

    const isFireFox =
      compatibility && compatibility.reason !== INCOMPATIBLE_NOT_FIREFOX;
    const enableAddonRecommendations =
      config.get('enableAddonRecommendations') &&
      addonType === ADDON_TYPE_EXTENSION;

    return (
      <div
        className={makeClassName('Addon', `Addon-${addonType}`, {
          'Addon-theme': isTheme,
          'Addon--has-more-than-0-addons': numberOfAddonsByAuthors > 0,
          'Addon--has-more-than-3-addons': numberOfAddonsByAuthors > 3,
        })}
        data-site-identifier={addon ? addon.id : null}
      >
        {addon && (
          <Helmet>
            <title>{addon.name}</title>
          </Helmet>
        )}

        {errorBanner}
        <div className="Addon-header-wrapper">
          <Card className="Addon-header-info-card" photonStyle>
            {isFireFox && !isCompatible ? (
              <AddonCompatibilityError
                className="Addon-header-compatibility-error"
                downloadUrl={compatibility.downloadUrl}
                maxVersion={compatibility.maxVersion}
                minVersion={compatibility.minVersion}
                reason={compatibility.reason}
              />
            ) : null}
            <header className="Addon-header">
              {this.headerImage()}

              <h1 className="Addon-title" {...titleProps} />

              <AddonBadges addon={addon} />

              <div className="Addon-summary-and-install-button-wrapper">
                {showSummary ? (
                  <p className="Addon-summary" {...summaryProps} />
                ) : null}

                {addon &&
                  isFireFox && (
                    <InstallButton
                      {...this.props}
                      disabled={!isCompatible}
                      ref={(ref) => {
                        this.installButton = ref;
                      }}
                      defaultInstallSource={defaultInstallSource}
                      status={installStatus}
                      useButton
                    />
                  )}
                {addon &&
                  !isFireFox && (
                    <Button
                      buttonType="confirm"
                      href={downloadUrl}
                      puffy
                      className="Button--get-firefox"
                    >
                      {i18n.gettext('Only with Firefox—Get Firefox Now')}
                    </Button>
                  )}
              </div>

              <h2 className="visually-hidden">
                {i18n.gettext('Extension Metadata')}
              </h2>
            </header>
          </Card>

          <Card className="Addon-header-meta-and-ratings" photonStyle>
            <AddonMeta addon={addon} />
          </Card>
        </div>

        <div className="Addon-details">
          <div className="Addon-main-content">
            {this.renderAddonsByAuthorsCard({ isForTheme: true })}

            {addonPreviews.length > 0 && !isTheme ? (
              <Card
                className="Addon-screenshots"
                header={i18n.gettext('Screenshots')}
              >
                <ScreenShots previews={addonPreviews} />
              </Card>
            ) : null}

            {this.renderShowMoreCard()}

            {enableAddonRecommendations && (
              <AddonRecommendations addon={addon} />
            )}
          </div>

          {this.renderRatingsCard()}

          <ContributeCard addon={addon} />

          <AddAddonToCollection addon={addon} />

          <AddonMoreInfo addon={addon} />

          <PermissionsCard addon={addon} />

          {this.renderVersionReleaseNotes()}

          {this.renderAddonsByAuthorsCard({ isForTheme: false })}
        </div>
      </div>
    );
    // eslint-enable react/no-danger
  }
}

export function mapStateToProps(state, ownProps) {
  const { slug } = ownProps.params;
  let addon = getAddonBySlug(state, slug);

  // It is possible to load an add-on by its ID but in the routing parameters,
  // the parameter is always named `slug`.
  if (slugIsPositiveID(slug)) {
    addon = getAddonByID(state, slug);
  }

  let addonsByAuthors;
  let installedAddon = {};

  if (addon) {
    addonsByAuthors = getAddonsForSlug(state.addonsByAuthors, addon.slug);
    installedAddon = state.installations[addon.guid] || {};
  }

  return {
    addon,
    // TODO: fix the spreads in https://github.com/mozilla/addons-frontend/issues/1416
    //
    // These spreads obscure a lot of hidden properties but they
    // cannot be deleted until core/reducers/addons, core/installAddon,
    // and maybe others get fixed up, who knows.
    //
    // The withInstallHelpers HOC needs to access properties like id and
    // properties from addon.theme_data (which are spread onto addon) and
    // maybe others.
    ...addon,
    platformFiles: addon ? addon.platformFiles : {},
    // The withInstallHelpers HOC also needs to access some properties in
    // here like guid and probably others.
    ...installedAddon,
    installStatus: installedAddon.status || UNKNOWN,
    clientApp: state.api.clientApp,
    lang: state.api.lang,
    userAgentInfo: state.api.userAgentInfo,
    addonsByAuthors,
  };
}

export const extractId = (ownProps) => {
  return ownProps.params.slug;
};

export default compose(
  withRouter,
  translate(),
  connect(mapStateToProps),
  withInstallHelpers({ defaultInstallSource: INSTALL_SOURCE_DETAIL_PAGE }),
  withFixedErrorHandler({ fileName: __filename, extractId }),
)(AddonBase);
