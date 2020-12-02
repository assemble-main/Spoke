import passportSlack from "@aoberoi/passport-slack";
import express, { Request, Response } from "express";
import passport from "passport";
import Auth0Strategy from "passport-auth0";
import { Strategy as LocalStrategy } from "passport-local";
import request from "superagent";

import { config } from "../config";
import logger from "../logger";
import { capitalizeWord } from "./api/lib/utils";
import { UserRecord } from "./api/types";
import { contextForRequest } from "./contexts";
import localAuthHelpers, { LocalAuthError } from "./local-auth-helpers";
import { userLoggedIn } from "./models/cacheable_queries";
import { SpokeRequest } from "./types";

type PassportCallback = (err: Error | null, result?: any) => void;

const {
  BASE_URL,
  AUTOJOIN_ORG_UUID,
  SLACK_TEAM_NAME,
  SLACK_TEAM_ID,
  SLACK_CLIENT_ID,
  SLACK_CLIENT_SECRET,
  SLACK_SCOPES,
  SLACK_CONVERT_EXISTING,
  AUTH0_DOMAIN,
  AUTH0_CLIENT_ID,
  AUTH0_CLIENT_SECRET
} = config;

const SHOULD_AUTOJOIN_NEW_USER = !!AUTOJOIN_ORG_UUID;
const AUTOJOIN_URL = SHOULD_AUTOJOIN_NEW_USER
  ? `${BASE_URL}/${AUTOJOIN_ORG_UUID}/join`
  : "";

function redirectPostSignIn(req: Request, res: Response, isNewUser: boolean) {
  const redirectDestionation = !req.query.state
    ? SHOULD_AUTOJOIN_NEW_USER && isNewUser
      ? AUTOJOIN_URL
      : "/"
    : req.query.state
    ? req.query.state
    : "/";

  return res.redirect(redirectDestionation);
}

function setupSlackPassport() {
  const options = {
    clientID: SLACK_CLIENT_ID,
    clientSecret: SLACK_CLIENT_SECRET,
    callbackURL: `${BASE_URL}/login-callback`,
    authorizationURL: SLACK_TEAM_NAME
      ? `https://${SLACK_TEAM_NAME}.slack.com/oauth/authorize`
      : undefined
  };

  const strategy = new passportSlack.Strategy(
    options,
    async (
      accessToken: string,
      scopes: string[],
      team: string,
      // eslint-disable-next-line no-unused-vars,@typescript-eslint/no-unused-vars
      { bot, incomingWebhook }: { bot: string; incomingWebhook: string },
      // eslint-disable-next-line no-unused-vars,@typescript-eslint/no-unused-vars
      { user, team: teamProfile }: { user: any; team: any },
      done: PassportCallback
    ) => {
      // scopes is a Set
      if (config.SLACK_TOKEN) {
        const response = await request
          .get(`https://slack.com/api/users.profile.get`)
          .query({ token: config.SLACK_TOKEN, user: user.id })
          .then((res) => res.body);
        if (!response.ok) {
          logger.error("Error fetching Slack profile", { response });
        } else {
          const userProfile = response.profile;
          const { real_name, first_name, last_name, phone } = userProfile;
          user = { ...user, real_name, first_name, last_name, phone };
        }
      }

      return done(null, user);
    }
  );

  passport.use(strategy);

  passport.serializeUser(({ id: slackUserId }, done) =>
    done(null, slackUserId)
  );

  passport.deserializeUser((slackUserId, done) =>
    userLoggedIn(slackUserId, "auth0_id")
      .then((user: any) => done(null, user || false))
      .catch((error: any) => done(error))
  );

  const handleLogin = async (req: SpokeRequest, res: Response) => {
    const { db } = contextForRequest(req);
    const { user } = req;
    // set slack_id to auth0Id to avoid changing the schema
    const auth0Id = user && user.id;
    if (!auth0Id) {
      throw new Error("Null user in login callback");
    }
    let existingUser = await db
      .reader("user")
      .where({ auth0_id: auth0Id })
      .first()
      .catch((err) => {
        logger.error("Slack login error: could not find existing user: ", err);
        throw err;
      });

    if (!existingUser && SLACK_CONVERT_EXISTING) {
      const [existingEmailUser] = await db
        .master("user")
        .update({ auth0_id: user.id })
        .where({ email: user.email })
        .returning("*");

      if (existingEmailUser) {
        existingUser = existingEmailUser;
      }
    }

    if (!existingUser) {
      let first_name;
      let last_name;
      const splitName = user.name ? user.name.split(" ") : ["First", "Last"];
      if (user.first_name && user.last_name) {
        // Spoke was granted the 'users.profile:read' scope so use Slack-provided first/last
        first_name = user.first_name;
        last_name = user.last_name;
      } else if (splitName.length === 1) {
        [first_name] = splitName;
        last_name = "";
      } else if (splitName.length === 2) {
        [first_name, last_name] = splitName;
      } else {
        [first_name] = splitName;
        last_name = splitName.slice(1, splitName.length + 1).join(" ");
      }

      const userData = {
        auth0_id: auth0Id,
        first_name,
        last_name,
        cell: user.phone ?? "unknown",
        email: user.email,
        is_superadmin: false
      };

      await db
        .master("user")
        .insert(userData)
        .catch((err) => {
          logger.error("Slack login error: could not insert new user: ", err);
          throw err;
        });

      return redirectPostSignIn(req, res, true);
    }

    return redirectPostSignIn(req, res, false);
  };

  // Cast as any to allow passing Slack options
  const passportOptions: any = {
    scope: SLACK_SCOPES.split(","),
    team: SLACK_TEAM_ID
  };

  const app = express();
  app.get("/login", passport.authenticate("slack", passportOptions));

  app.get(
    "/login-callback",
    passport.authenticate("slack", { failureRedirect: "/login" }),
    handleLogin
  );
  return app;
}

function setupAuth0Passport() {
  const strategy = new Auth0Strategy(
    {
      domain: AUTH0_DOMAIN,
      clientID: AUTH0_CLIENT_ID,
      clientSecret: AUTH0_CLIENT_SECRET,
      callbackURL: `${BASE_URL}/login-callback`
    },
    (
      accessToken: string,
      refreshToken: string,
      extraParams: Record<string, unknown>,
      profile: any,
      done: PassportCallback
    ) => done(null, profile)
  );

  passport.use(strategy);

  passport.serializeUser((auth0User: any, done) => {
    // This is the Auth0 user object, not the db one
    // eslint-disable-next-line no-underscore-dangle
    const auth0Id = auth0User.id || auth0User._json.sub;
    done(null, auth0Id);
  });

  passport.deserializeUser((auth0Id: string, done) =>
    userLoggedIn(auth0Id, "auth0_id")
      .then((user: any) => done(null, user || false))
      .catch((error: any) => done(error))
  );

  const handleLogin = async (req: SpokeRequest, res: Response) => {
    const { db } = contextForRequest(req);
    const auth0Id = req.user && (req.user.id || req.user._json.sub);
    if (!auth0Id) {
      throw new Error("Null user in login callback");
    }

    const existingUser = await db
      .reader("user")
      .where({ auth0_id: auth0Id })
      .first();

    if (!existingUser) {
      // eslint-disable-next-line no-underscore-dangle
      const userJson = req.user._json;
      const userMetadata =
        userJson["https://spoke/user_metadata"] || userJson.user_metadata || {};
      const userData = {
        auth0_id: auth0Id,
        first_name: capitalizeWord(userMetadata.given_name) || "",
        last_name: capitalizeWord(userMetadata.family_name) || "",
        cell: userMetadata.cell || "",
        email: userJson.email,
        is_superadmin: false
      };

      await db.master("user").insert(userData);

      return redirectPostSignIn(req, res, true);
    }

    return redirectPostSignIn(req, res, false);
  };

  const app = express();
  app.get(
    "/login-callback",
    passport.authenticate("auth0", { failureRedirect: "/login" }),
    handleLogin
  );
  return app;
}

function setupLocalAuthPassport() {
  const strategy = new LocalStrategy(
    {
      usernameField: "email",
      passReqToCallback: true
    },
    async (
      req: SpokeRequest,
      username: string,
      password: string,
      done: PassportCallback
    ) => {
      const { db } = contextForRequest(req);
      const {
        nextUrl = "",
        authType
      }: { nextUrl: string; authType: string } = req.body;

      // eslint-disable-next-line no-useless-escape
      const uuidMatch = nextUrl.match(/\w{8}-(\w{4}\-){3}\w{12}/);
      if (!uuidMatch) return done(new LocalAuthError("Could not match uuid"));

      const lowerCaseEmail = username.toLowerCase();
      const existingUser = await db
        .reader("user")
        .where({ email: lowerCaseEmail })
        .first();

      // Run login, signup, or reset functions based on request data
      if (authType && !localAuthHelpers[authType]) {
        return done(new LocalAuthError("Unknown auth type"));
      }

      try {
        const user = await localAuthHelpers[authType]({
          db,
          lowerCaseEmail,
          password,
          existingUser,
          nextUrl,
          uuidMatch,
          reqBody: req.body
        });
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  );
  passport.use(strategy);

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser((id: string, done) =>
    userLoggedIn(parseInt(id, 10))
      .then((user: any) => done(null, user || false))
      .catch((error: any) => done(error))
  );

  const app = express();
  app.post("/login-callback", (req, res, next) => {
    // See: http://www.passportjs.org/docs/authenticate/#custom-callback
    passport.authenticate("local", (err: any, user: any, _info: any) => {
      // Check custom property rather than using instanceof because errors are being passed as
      // objects, not classes
      if (err && err.errorType === "LocalAuthError") {
        return res.status(400).send({ success: false, message: err.message });
      }
      if (err) {
        // System error
        return next(err);
      }

      // Default behavior
      (<any>req).logIn(user, (logInErr: any) => {
        if (logInErr) {
          return next(logInErr);
        }
        return res.redirect(req.body.nextUrl || "/");
      });
    })(req, res, next);
  });

  return app;
}

// Convert a Spoke user record to the type expected by passport.(de)serializeUser
export const sessionUserMap = {
  local: (user: UserRecord) => ({ id: user.id }),
  auth0: (user: UserRecord) => ({ id: user.auth0_id }),
  slack: (user: UserRecord) => ({ id: user.auth0_id })
};

export default {
  local: setupLocalAuthPassport,
  auth0: setupAuth0Passport,
  slack: setupSlackPassport
};
