/* eslint-disable import/prefer-default-export */
import type { GraphQLError } from "graphql";

export const isOrganizationsPermissionError = (gqlError: GraphQLError) => {
  return (
    gqlError.path &&
    gqlError.path[gqlError.path.length - 1] === "organizations" &&
    gqlError.extensions.code === "FORBIDDEN"
  );
};
