import type { Tag, Team, TeamInput } from "@spoke/spoke-codegen";

export type TagWithTitle = Pick<Tag, "id" | "title">;

export type TeamForAssignment = Pick<
  Team,
  | "id"
  | "title"
  | "textColor"
  | "backgroundColor"
  | "isAssignmentEnabled"
  | "assignmentType"
  | "maxRequestCount"
> & {
  escalationTags: TagWithTitle[];
};

export type TeamInputWithTags = TeamInput & { escalationTags?: TagWithTitle[] };
