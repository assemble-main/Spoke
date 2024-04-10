/* eslint-disable import/prefer-default-export */
import { ApolloArmor } from "@escape.tech/graphql-armor";
import { addMocksToSchema } from "@graphql-tools/mock";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { ApolloServerPluginLandingPageGraphQLPlayground } from "apollo-server-core";
import { ApolloError, ApolloServer } from "apollo-server-express";
import express from "express";
import { graphqlUploadExpress } from "graphql-upload";

import { schema } from "../../../libs/gql-schema/schema";
import { config } from "../../config";
import logger from "../../logger";
import mocks from "../api/mocks";
import { resolvers } from "../api/schema";
import { contextForRequest } from "../contexts";

export const createRouter = async () => {
  const router = express();

  const executableSchema = makeExecutableSchema({
    typeDefs: schema,
    resolvers
  });

  const schemaWithMocks = addMocksToSchema({
    schema: executableSchema,
    mocks,
    resolvers,
    preserveResolvers: true
  });

  const formatError = (err: any) => {
    // Ignore intentional ApolloErrors
    if (err.originalError instanceof ApolloError) {
      return err;
    }

    // node-postgres does not use an Error subclass so we check for schema property
    const hasSchema = Object.prototype.hasOwnProperty.call(
      err.originalError,
      "schema"
    );

    if (hasSchema && config.isProduction) {
      logger.error("Postgres error: ", err);
      return new Error("Internal server error");
    }

    logger.error("GraphQL error: ", err);
    return err;
  };

  const armor = new ApolloArmor({
    maxDepth: {
      n: 10
    }
  });
  const protection = armor.protect();

  const plugins = config.isProduction
    ? []
    : [ApolloServerPluginLandingPageGraphQLPlayground()];

  const server = new ApolloServer({
    schema: schemaWithMocks,
    formatError,
    debug: !config.isProduction,
    introspection: !config.isProduction,
    ...protection,
    plugins: [...protection.plugins, ...plugins],
    context: async ({ req }) => contextForRequest(req)
  });

  await server.start();

  router.use(
    graphqlUploadExpress({
      maxFileSize: 50 * 1000 * 1000, // 50 MB
      maxFiles: 20
    })
  );
  router.use(server.getMiddleware({ path: "/graphql" }));

  return router;
};
