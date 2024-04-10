import type { Notice } from "@spoke/spoke-codegen";

import { config } from "../../../config";
import { get10DlcBrandNotices } from "./register-10dlc-brand";
import SpokeRewiredShutdownNotice from "./spoke-rewired-shutdown";
import type { OrgLevelNotificationGetter } from "./types";

export const getInstanceNotifications = (_userId: string): Notice[] => {
  return [
    ...(config.ENABLE_REWIRED_SHUTDOWN_NOTICE
      ? [SpokeRewiredShutdownNotice]
      : [])
  ];
};

export const getOrgLevelNotifications: OrgLevelNotificationGetter = async (
  userId,
  organizationId
) => {
  const notices: Notice[] = await Promise.all([
    get10DlcBrandNotices(userId, organizationId)
  ]).then((noticeSets) => noticeSets.flat());
  return notices;
};
