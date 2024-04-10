import partition from "lodash/partition";
import uniqBy from "lodash/uniqBy";
import type { PoolClient } from "pg";

import { config } from "../../../config";
import { getFormattedPhoneNumber } from "../../../lib/phone-format";
import { getFormattedZip } from "../../../lib/zip-format";

const nanpRegex = /^\+1[0-9]{10}$/;

export interface ValidationStats {
  dupeCount?: number;
  optOutCount?: number;
  invalidCellCount?: number;
  missingCellCount?: number;
  zipCount?: number;
}

export const getValidatedData = <T extends { cell: string; zip: string }>(
  data: T[],
  optOuts: { cell: string }[]
) => {
  const optOutCells = optOuts.map((optOut) => optOut.cell);

  const [rowsWithCells, missingCellRows] = partition(data, (row) => !!row.cell);
  const rowsWithFormattedCells = rowsWithCells.map(({ cell, ...rest }) => ({
    ...rest,
    cell: getFormattedPhoneNumber(cell, config.PHONE_NUMBER_COUNTRY) as string
  }));
  // Restrict to 10-digit US numbers
  const [
    rowsWithValidCells,
    invalidCellRows
  ] = partition(rowsWithFormattedCells, (row) =>
    nanpRegex.test(row.cell ?? "")
  );

  const count = rowsWithValidCells.length;
  const dedupedContacts = uniqBy(rowsWithValidCells, (row) => row.cell);
  const dupeCount = count - dedupedContacts.length;

  const [subscribedContacts, optOutRows] = partition(
    dedupedContacts,
    (row) => optOutCells.indexOf(row.cell) === -1
  );

  const contactsWithValidZips = subscribedContacts.map(({ zip, ...rest }) => ({
    ...rest,
    zip: getFormattedZip(zip) ?? ""
  }));
  const zipCount = contactsWithValidZips.filter((row) => !!row.zip).length;

  return {
    validatedData: contactsWithValidZips,
    validationStats: {
      dupeCount,
      optOutCount: optOutRows.length,
      invalidCellCount: invalidCellRows.length,
      missingCellCount: missingCellRows.length,
      zipCount
    }
  };
};

export const deleteOptedOutContacts = async (
  client: PoolClient,
  campaignId: number
) => {
  const optOutSubQuery = config.OPTOUTS_SHARE_ALL_ORGS
    ? `select cell from opt_out`
    : `select cell from opt_out where organization_id = (select organization_id from campaign where id = $1)`;

  const { rowCount: deleteOptOutCells } = await client.query(
    `
      with deleted_contacts as (
        delete from campaign_contact
        where
          campaign_id = $1
          and cell in (${optOutSubQuery})
        returning *
      )
      insert into filtered_contact (
        campaign_id,
        external_id,
        first_name,
        last_name,
        cell,
        zip,
        custom_fields,
        created_at,
        updated_at,
        timezone,
        filtered_reason
      )
      select
        campaign_id,
        external_id,
        first_name,
        last_name,
        cell,
        zip,
        custom_fields,
        created_at,
        updated_at,
        timezone,
        'OPTEDOUT'
      from deleted_contacts
    `,
    [campaignId]
  );

  return deleteOptOutCells;
};

export const getContactResultMessage = (validationStats: ValidationStats) => {
  const resultMessages: string[] = [];

  const {
    optOutCount = 0,
    dupeCount = 0,
    missingCellCount = 0,
    invalidCellCount = 0,
    zipCount = 0
  } = validationStats;

  if (optOutCount) {
    resultMessages.push(
      `Number of contacts excluded due to their opt-out status: ${optOutCount}`
    );
  }
  if (dupeCount) {
    resultMessages.push(`Number of duplicate contacts removed: ${dupeCount}`);
  }
  if (missingCellCount) {
    resultMessages.push(
      `Number of contacts excluded due to missing cells: ${missingCellCount}`
    );
  }
  if (invalidCellCount) {
    resultMessages.push(
      `Number of contacts with excluded due to invalid cells: ${invalidCellCount}`
    );
  }
  if (zipCount) {
    resultMessages.push(`Number of contacts with valid zip codes: ${zipCount}`);
  }

  return resultMessages;
};

export const onlyCellFields = ["cell"];

export const requiredUploadFields = ["firstName", "lastName", "cell"];

export const topLevelUploadFields = [
  "firstName",
  "lastName",
  "cell",
  "zip",
  "external_id"
];

export interface ValidateCsvOptions {
  data: any[];
  meta: { fields: string[] };
  onlyCell: boolean;
}

export const validateCsv = ({ data, meta, onlyCell }: ValidateCsvOptions) => {
  const { fields } = meta;

  const missingFields = [];

  const requiredFields = onlyCell ? onlyCellFields : requiredUploadFields;

  for (const field of requiredFields) {
    if (!fields.includes(field)) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    const errorMessage = `Missing fields: ${missingFields.join(", ")}`;
    throw new Error(errorMessage);
  } else {
    const { validationStats, validatedData } = getValidatedData(data, []);

    const customFields = fields.filter(
      (field) => !topLevelUploadFields.includes(field)
    );

    return {
      customFields,
      validationStats,
      contacts: validatedData
    };
  }
};
