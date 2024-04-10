import { sqlResolvers } from "./lib/utils";

export const resolvers = {
  CannedResponse: {
    ...sqlResolvers(["id", "title", "text", "displayOrder"]),
    isUserCreated: (cannedResponse) => cannedResponse.user_id !== ""
  }
};

export default resolvers;
