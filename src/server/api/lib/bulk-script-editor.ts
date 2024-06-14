/* eslint-disable import/prefer-default-export */

import type { BulkUpdateScriptInput } from "@spoke/spoke-codegen";
import type { Knex } from "knex";

import { r } from "../../models";

export const getStepsToUpdate = async (
  trx: Knex.Transaction,
  findAndReplace: BulkUpdateScriptInput
) => {
  const { searchString, campaignIds, organizationId } = findAndReplace;
  const campaignsIds = campaignIds.map((cid: string) => parseInt(cid, 10));

  // Using array_to_string is easier and faster than using unnest(script_options) (https://stackoverflow.com/a/7222285)
  let interactionStepsToChangeQuery = r
    .knex("interaction_step")
    .transacting(trx)
    .select([
      "interaction_step.id",
      "campaign_id",
      "script_options",
      "campaign.title"
    ])
    .join("campaign", "campaign_id", "campaign.id")
    .whereRaw("array_to_string(script_options, '||') like ?", [
      `%${searchString}%`
    ])
    .where({ organization_id: organizationId });
  if (campaignsIds.length > 0) {
    interactionStepsToChangeQuery = interactionStepsToChangeQuery.whereIn(
      "campaign_id",
      campaignsIds
    );
  }

  const interactionStepsToChange = await interactionStepsToChangeQuery;

  return interactionStepsToChange;
};
