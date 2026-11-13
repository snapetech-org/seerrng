import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import UpstreamIssueDetails from '@app/components/IssueDetails/UpstreamIssueDetails';
import { useTheme } from '@app/context/ThemeContext';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission, useUser } from '@app/hooks/useUser';
import ErrorPage from '@app/pages/_error';
import { getIssueListHref } from '@app/utils/issueNavigation';
import { MediaType } from '@server/constants/media';
import type Issue from '@server/entity/Issue';
import {
  DEFAULT_INTERFACE_THEME_ID,
  parseInterfaceTheme,
} from '@server/utils/interfaceTheme';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import useSWR from 'swr';

const IssuePage: NextPage = () => {
  const router = useRouter();
  const { user, loading } = useUser();
  const theme = useTheme();

  useRouteGuard(
    [
      Permission.MANAGE_ISSUES,
      Permission.CREATE_ISSUES,
      Permission.VIEW_ISSUES,
    ],
    { type: 'or' }
  );

  const issueId =
    typeof router.query.issueId === 'string' ? router.query.issueId : '';
  const selectedThemeId =
    parseInterfaceTheme(user?.settings?.interfaceTheme) ??
    DEFAULT_INTERFACE_THEME_ID;
  const selectedTheme = theme.interfaceThemes.find(
    (entry) => entry.id === selectedThemeId
  );
  const themeReady =
    !loading &&
    Boolean(user) &&
    theme.interfaceTheme === selectedThemeId &&
    Boolean(selectedTheme);
  const upstream = selectedTheme?.layout === 'upstream';
  const { data: issue, error } = useSWR<Issue>(
    themeReady && upstream && issueId
      ? `/api/v1/issue/${issueId}`
      : null
  );
  const supportsUpstreamDetails =
    issue?.media.mediaType === MediaType.MOVIE ||
    issue?.media.mediaType === MediaType.TV;

  useEffect(() => {
    if (!router.isReady || !themeReady || !issueId) return;
    if (!upstream || (issue && !supportsUpstreamDetails)) {
      void router.replace(getIssueListHref(issueId));
    }
  }, [issue, issueId, router, supportsUpstreamDetails, themeReady, upstream]);

  if (
    !router.isReady ||
    !themeReady ||
    !upstream ||
    (issue && !supportsUpstreamDetails)
  ) {
    return <LoadingSpinner />;
  }
  if (error) return <ErrorPage statusCode={404} />;
  if (!issue) return <LoadingSpinner />;

  return <UpstreamIssueDetails />;
};

export default IssuePage;
