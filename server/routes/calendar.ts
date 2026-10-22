import { Permission } from '@server/lib/permissions';
import { getReleaseCalendar } from '@server/lib/releaseCalendar';
import {
  CalendarQueryError,
  parseCalendarQuery,
} from '@server/lib/releaseCalendar/query';
import { getUserEnabledMediaCategories } from '@server/lib/userMediaCategories';
import {
  UserMutationActorUnauthorizedError,
  runUserSecurityReadWithActor,
} from '@server/lib/userSecurityMutation';
import { Router } from 'express';
const router = Router();
router.get('/', async (req, res, next) => {
  try {
    const isAdmin = req.user!.hasPermission(Permission.ADMIN);
    const query = parseCalendarQuery(
      req.query,
      req.user!.hasPermission(
        [Permission.ADMIN, Permission.MANAGE_REQUESTS, Permission.REQUEST_VIEW],
        { type: 'or' }
      ),
      isAdmin
    );
    res.set('Cache-Control', 'private, no-cache');
    const result = await getReleaseCalendar(query, req.user!.id, isAdmin, {
      enabledMediaCategories: getUserEnabledMediaCategories(req.user),
    });
    await runUserSecurityReadWithActor(
      req.user!.id,
      req.user!.id,
      Permission.ADMIN,
      async (actor) => {
        parseCalendarQuery(
          req.query,
          actor.hasPermission(
            [
              Permission.ADMIN,
              Permission.MANAGE_REQUESTS,
              Permission.REQUEST_VIEW,
            ],
            { type: 'or' }
          ),
          actor.hasPermission(Permission.ADMIN)
        );
        // Source details require current administrator authority at response time.
        if (!actor.hasPermission(Permission.ADMIN))
          result.partialSources = result.partialSources.map(({ source }) => ({
            source,
          }));
        res.json(result);
      },
      {
        expectedCredentialVersion:
          req.session?.userId === req.user!.id
            ? req.session.credentialVersion
            : undefined,
      }
    );
  } catch (error) {
    if (error instanceof UserMutationActorUnauthorizedError)
      return res
        .status(403)
        .json({ message: 'Sign in again before viewing the calendar.' });
    if (error instanceof CalendarQueryError)
      return res.status(error.status).json({ message: error.message });
    return next({
      status: 502,
      message: 'The release calendar could not be loaded.',
    });
  }
});
export default router;
