import request from "superagent";

import { r } from "../../models";
import type { OrgLevelNotificationGetter } from "./types";

const PORTAL_API_URL = "https://portal-api.spokerewired.com/graphql";

const fetchBillingAccountQuery = `
  query GetBillingAccountBySwitchboardProfileId($switchboardProfileId: UUID!) {
    billingAccount: billingAccountBySwitchboardProfileId(
      switchboardProfileId: $switchboardProfileId
    ) {
      id
      __typename
    }
  }
`;

const fetchBrandQuery = `
  query AnonGetTcr10DlcBrandByBillingAccountId($billingAccountId: UUID!) {
    brand: brandByBillingAccountId(billingAccountId: $billingAccountId) {
    id
    state
    campaigns: tcr10DlcCampaignsByBrandId {
      nodes {
        id
        state
        __typename
      }
    }
    __typename
    }
  }
`;

const fetchProfileQuery = `
  query GetSwitchboardProfile($profileId: UUID!) {
    profile: switchboardProfileByProfileId(profileId: $profileId) {
      id
      channel
    }
  }
`;

export const get10DlcBrandNotices: OrgLevelNotificationGetter = async (
  userId,
  organizationId
) => {
  const profilesQuery = r
    .knex("messaging_service")
    .join(
      "user_organization",
      "user_organization.organization_id",
      "messaging_service.organization_id"
    )
    .select(["messaging_service_sid", r.knex.raw("array_agg(role) as roles")])
    .groupBy("messaging_service_sid")
    .where({
      service_type: "assemble-numbers",
      user_id: userId,
      active: true
    })
    .whereIn("role", ["OWNER", "ADMIN", "SUPERVOLUNTEER"])
    .where({
      "user_organization.organization_id": organizationId
    });

  const profiles: {
    messaging_service_sid: string;
    roles: string[];
  }[] = await profilesQuery;

  const ownedProfiles = profiles.filter(({ roles }) => roles.includes("OWNER"));

  let profilesWithChannels: any[] = [];
  try {
    profilesWithChannels = await Promise.all(
      profiles.map(async ({ messaging_service_sid }) => {
        const payload = {
          operationName: "GetSwitchboardProfile",
          query: fetchProfileQuery,
          variables: {
            profileId: messaging_service_sid
          }
        };

        const profileResponse = await request
          .post(PORTAL_API_URL)
          .timeout(1000)
          .send(payload);

        return profileResponse.body.data?.profile;
      })
    );
  } catch {
    // Error fetching from Portal (it may not be reachable)
    return [];
  }

  // if a registered profile exists, show the notice for their lowest cost pricing plan

  const profile10Dlc = profilesWithChannels.find((p) => p.channel === "_10DLC");
  if (profile10Dlc !== undefined) {
    return [
      {
        __typename: "Pricing10DlcNotice",
        id: profile10Dlc.id
      }
    ];
  }

  const profileTollFree = profilesWithChannels.find(
    (p) => p.channel === "TOLL_FREE"
  );
  if (profileTollFree !== undefined)
    return [
      {
        __typename: "PricingTollFreeNotice",
        id: profileTollFree.id
      }
    ];

  const messagingServiceSid =
    ownedProfiles.length > 0
      ? ownedProfiles[0].messaging_service_sid
      : profiles[0].messaging_service_sid;

  let brand: { campaigns: { nodes: { state: string }[] } } | undefined;

  for (const profile of profiles) {
    const payload = {
      operationName: "GetBillingAccountBySwitchboardProfileId",
      query: fetchBillingAccountQuery,
      variables: {
        switchboardProfileId: profile.messaging_service_sid
      }
    };

    const billingAccountResponse = await request
      .post(PORTAL_API_URL)
      .send(payload);

    if (billingAccountResponse.body?.data?.billingAccount?.id) {
      const brandPayload = {
        operationName: "AnonGetTcr10DlcBrandByBillingAccountId",
        query: fetchBrandQuery,
        variables: {
          billingAccountId: billingAccountResponse.body.data.billingAccount.id
        }
      };

      const brandResponse = await request
        .post(PORTAL_API_URL)
        .send(brandPayload);

      const brandData = brandResponse.body.data?.brand;
      if (brandData) brand = brandData;
    }
  }

  if (brand === undefined)
    // they haven't registered a brand yet
    return [
      {
        __typename: "Register10DlcBrandNotice",
        id: messagingServiceSid,
        tcrRegistrationUrl:
          ownedProfiles.length > 0
            ? `https://portal.spokerewired.com/10dlc-registration/${messagingServiceSid}`
            : null
      }
    ];

  const campaigns = brand?.campaigns?.nodes;
  if (
    campaigns === undefined ||
    !campaigns.some(({ state }: { state: string }) => state === "REGISTERED")
  )
    // they haven't registered a campaign yet
    return [
      {
        __typename: "Register10DlcCampaignNotice",
        id: messagingServiceSid,
        tcrRegistrationUrl:
          ownedProfiles.length > 0
            ? `https://portal.spokerewired.com/10dlc-registration/${messagingServiceSid}`
            : null
      }
    ];

  // they registered a campaign and a 10DLC profile isn't added to spoke yet
  return [
    {
      __typename: "Pending10DlcCampaignNotice",
      id: messagingServiceSid
    }
  ];
};

export default get10DlcBrandNotices;
