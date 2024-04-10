import {
  RequestAutoApproveType,
  UserRoleType
} from "../../api/organization-membership";
import { config } from "../../config";
import { stringIsAValidUrl } from "../../lib/utils";
import { r } from "../models";
import { organizationCache } from "../models/cacheable_queries/organization";
import { accessRequired, roleIndex } from "./errors";
import { AutosendingControlsMode } from "./types";

export enum CampaignBuilderMode {
  Basic = "BASIC",
  Advanced = "ADVANCED"
}

interface IOrganizationSettings {
  defaulTexterApprovalStatus: string;
  optOutMessage: string;
  numbersApiKey?: string;
  trollbotWebhookUrl?: string;
  showContactLastName: boolean;
  showContactCell: boolean;
  confirmationClickForScriptLinks: boolean;
  startCampaignRequiresApproval: boolean;
  scriptPreviewForSupervolunteers: boolean;
  showDoNotAssignMessage: boolean;
  doNotAssignMessage: string;
  defaultCampaignBuilderMode: CampaignBuilderMode;
  defaultAutosendingControlsMode: AutosendingControlsMode;
  maxSmsSegmentLength: number | null;
}

const SETTINGS_PERMISSIONS: {
  [key in keyof IOrganizationSettings]: UserRoleType;
} = {
  optOutMessage: UserRoleType.TEXTER,
  showContactLastName: UserRoleType.TEXTER,
  showContactCell: UserRoleType.TEXTER,
  confirmationClickForScriptLinks: UserRoleType.TEXTER,
  showDoNotAssignMessage: UserRoleType.TEXTER,
  doNotAssignMessage: UserRoleType.TEXTER,
  startCampaignRequiresApproval: UserRoleType.SUPERVOLUNTEER,
  scriptPreviewForSupervolunteers: UserRoleType.SUPERVOLUNTEER,
  defaultCampaignBuilderMode: UserRoleType.SUPERVOLUNTEER,
  defaultAutosendingControlsMode: UserRoleType.ADMIN,
  defaulTexterApprovalStatus: UserRoleType.OWNER,
  numbersApiKey: UserRoleType.OWNER,
  trollbotWebhookUrl: UserRoleType.OWNER,
  maxSmsSegmentLength: UserRoleType.TEXTER
};

const SETTINGS_WRITE_PERMISSIONS: {
  [key in keyof IOrganizationSettings]: UserRoleType;
} = {
  optOutMessage: UserRoleType.OWNER,
  showContactLastName: UserRoleType.OWNER,
  showContactCell: UserRoleType.OWNER,
  confirmationClickForScriptLinks: UserRoleType.OWNER,
  defaulTexterApprovalStatus: UserRoleType.OWNER,
  numbersApiKey: UserRoleType.OWNER,
  trollbotWebhookUrl: UserRoleType.OWNER,
  scriptPreviewForSupervolunteers: UserRoleType.OWNER,
  defaultCampaignBuilderMode: UserRoleType.OWNER,
  showDoNotAssignMessage: UserRoleType.OWNER,
  doNotAssignMessage: UserRoleType.OWNER,
  defaultAutosendingControlsMode: UserRoleType.OWNER,
  startCampaignRequiresApproval: UserRoleType.SUPERADMIN,
  maxSmsSegmentLength: UserRoleType.OWNER
};

const SETTINGS_NAMES: Partial<
  { [key in keyof IOrganizationSettings]: string }
> = {
  optOutMessage: "opt_out_message"
};

const SETTINGS_DEFAULTS: IOrganizationSettings = {
  defaulTexterApprovalStatus: RequestAutoApproveType.APPROVAL_REQUIRED,
  optOutMessage:
    config.OPT_OUT_MESSAGE ??
    "I'm opting you out of texts immediately. Have a great day.",
  showContactLastName: false,
  showContactCell: false,
  confirmationClickForScriptLinks: true,
  startCampaignRequiresApproval: false,
  scriptPreviewForSupervolunteers: false,
  showDoNotAssignMessage: false,
  doNotAssignMessage:
    "Your ability to request texts has been put on hold. Please a contact a text team leader for more information.",
  defaultCampaignBuilderMode: CampaignBuilderMode.Advanced,
  defaultAutosendingControlsMode: AutosendingControlsMode.Detailed,
  maxSmsSegmentLength: 3
};

const SETTINGS_TRANSFORMERS: Partial<
  {
    [key in keyof IOrganizationSettings]: (
      value: string
    ) => IOrganizationSettings[key];
  }
> = {
  numbersApiKey: (value: string) => `${value.slice(0, 4)}****************`
};

const SETTINGS_VALIDATORS: {
  [key in keyof IOrganizationSettings]?: { (value: string): void };
} = {
  numbersApiKey: (value: string) => {
    // User probably made a mistake - no API key will have a *
    if (value.includes("*")) {
      throw new Error("Numbers API Key cannot have character: *");
    }
  },
  trollbotWebhookUrl: (value: string) => {
    if (!stringIsAValidUrl(value)) {
      throw new Error("TrollBot webhook URL must be a valid URL");
    }
  },
  defaultCampaignBuilderMode: (value: string) => {
    if (
      ![
        CampaignBuilderMode.Basic as string,
        CampaignBuilderMode.Advanced as string
      ].includes(value)
    ) {
      throw new Error("Invalid campaign builder mode");
    }
  }
};

export const getOrgFeature = <T extends keyof IOrganizationSettings>(
  featureName: T,
  rawFeatures = "{}"
): IOrganizationSettings[T] | null => {
  const defaultValue = SETTINGS_DEFAULTS[featureName];
  const finalName = SETTINGS_NAMES[featureName] ?? featureName;
  try {
    const features = JSON.parse(rawFeatures);

    const foundValue = features[finalName];
    const returnValue =
      foundValue === undefined ? defaultValue ?? null : foundValue;

    const transformer = SETTINGS_TRANSFORMERS[featureName];
    if (transformer && returnValue) {
      const result = transformer(returnValue);
      return result as IOrganizationSettings[T];
    }
    return returnValue;
  } catch (_err) {
    return SETTINGS_DEFAULTS[featureName] ?? null;
  }
};

interface SettingsResolverType<F extends keyof IOrganizationSettings> {
  (
    organization: { id: string; features: string },
    _: any,
    context: { user: { id: string } }
  ): Promise<IOrganizationSettings[F] | null>;
}

const settingResolvers = (settingNames: (keyof IOrganizationSettings)[]) =>
  settingNames.reduce((accumulator, settingName) => {
    const resolver: SettingsResolverType<typeof settingName> = async (
      { id: organizationId, features },
      _,
      { user }
    ) => {
      const permission = SETTINGS_PERMISSIONS[settingName];
      await accessRequired(user, organizationId, permission);
      return getOrgFeature(settingName, features);
    };
    return Object.assign(accumulator, { [settingName]: resolver });
  }, {});

export const resolvers = {
  OrganizationSettings: {
    id: (organization: { id: number }) => organization.id,
    ...settingResolvers([
      "defaulTexterApprovalStatus",
      "optOutMessage",
      "numbersApiKey",
      "trollbotWebhookUrl",
      "showContactLastName",
      "showContactCell",
      "confirmationClickForScriptLinks",
      "startCampaignRequiresApproval",
      "scriptPreviewForSupervolunteers",
      "defaultCampaignBuilderMode",
      "showDoNotAssignMessage",
      "doNotAssignMessage",
      "defaultAutosendingControlsMode",
      "maxSmsSegmentLength"
    ])
  }
};

export const writePermissionRequired = (
  input: Partial<IOrganizationSettings>
): UserRoleType => {
  let highestRole = UserRoleType.TEXTER;
  const settingNames = Object.keys(input) as (keyof IOrganizationSettings)[];

  for (const settingName of settingNames) {
    const settingRequires = SETTINGS_WRITE_PERMISSIONS[settingName]!;
    if ([highestRole, settingRequires].includes(UserRoleType.SUPERADMIN)) {
      highestRole = UserRoleType.SUPERADMIN;
    } else {
      highestRole =
        roleIndex(settingRequires) > roleIndex(highestRole)
          ? settingRequires
          : highestRole;
    }
  }

  return highestRole;
};

export const updateOrganizationSettings = async (
  id: number,
  input: Partial<IOrganizationSettings>
) => {
  const currentFeatures: IOrganizationSettings = await r
    .knex("organization")
    .where({ id })
    .first("features")
    .then(({ features }: { features: string }) => JSON.parse(features))
    .catch(() => ({}));

  const features = Object.entries(input).reduce((acc, entry) => {
    const [key, value] = entry as [
      keyof IOrganizationSettings,
      string | undefined
    ];
    const validator = SETTINGS_VALIDATORS[key];
    if (validator && value) {
      validator(value);
    }
    const dbKey = SETTINGS_NAMES[key] ?? key;
    return Object.assign(acc, { [dbKey]: value });
  }, currentFeatures);

  const [organization] = await r
    .knex("organization")
    .where({ id })
    .update({ features: JSON.stringify(features) })
    .returning("*");

  await organizationCache.clear(id);

  return organization;
};
