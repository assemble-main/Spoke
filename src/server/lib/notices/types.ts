import type { Notice } from "@spoke/spoke-codegen";

export type OrgLevelNotificationGetter = (
  userId: string,
  organizationId: string
) => Promise<Notice[]> | Notice[];
