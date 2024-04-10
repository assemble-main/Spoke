import type { Upload } from "graphql-upload";
import { getFormattedPhoneNumber } from "src/lib/phone-format";

import { processContactsFile } from "./edit-campaign";

export const processNumbers = async (csvFile: Upload, numbersList: string) => {
  let numbers;

  if (csvFile) {
    const { contacts } = await processContactsFile({
      file: csvFile,
      onlyCell: true
    });

    numbers = contacts.map((contact) => {
      return getFormattedPhoneNumber(contact.cell);
    });
  }

  // .filter(Boolean) first to remove empty lines
  // and then again to remove any invalid phone numbers
  // getFormatted returns an empty string for invalid numbers
  if (numbersList) {
    const numbersArray = numbersList.split(/\r|\n|,/).filter(Boolean);
    numbers = numbersArray
      .map((number) => {
        return getFormattedPhoneNumber(number);
      })
      .filter(Boolean);
  }

  return numbers;
};

export default processNumbers;
