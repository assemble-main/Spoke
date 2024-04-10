import { useTheme } from "@material-ui/core";
import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import Grid from "@material-ui/core/Grid";
import TextField from "@material-ui/core/TextField";
import ArrowForwardIcon from "@material-ui/icons/ArrowForward";
import Autocomplete, {
  createFilterOptions
} from "@material-ui/lab/Autocomplete";
import type { FilterOptionsState } from "@material-ui/lab/useAutocomplete";
import uniq from "lodash/uniq";
import type { ParseResult } from "papaparse";
import Papa from "papaparse";
import React, { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";

import LoadingIndicator from "../../../../../components/LoadingIndicator";

const firstName = "First Name";
const lastName = "Last Name";
const cell = "Cell Phone";
const externalId = "External ID";
const zip = "Zip";

const namedFields = {
  first_name: firstName,
  firstname: firstName,
  firstName,
  last_name: lastName,
  lastname: lastName,
  lastName,
  cell,
  zip,
  external_id: externalId,
  externalId
};
type namedFieldsKeys = keyof typeof namedFields;

type requiredUploadFieldsValues = "First Name" | "Last Name" | "Cell Phone";
const requiredUploadFields = [
  firstName,
  lastName,
  cell
] as requiredUploadFieldsValues[];

const friendlyFieldNames = [firstName, lastName, cell, externalId, zip];

const fieldAliases = {
  "First Name": "firstName",
  "Last Name": "lastName",
  "Cell Phone": "cell",
  "External ID": "external_id",
  Zip: "zip"
};
type fieldAliasKeys = keyof typeof fieldAliases;

export type ColumnMapping = {
  column: namedFieldsKeys;
  remap: fieldAliasKeys | null;
};

export interface ConfigureColumnMappingDialogProps {
  contactsFile: File | null;
  open: boolean;
  onClose(): void;
  onSave(columnMappings: Array<ColumnMapping>): void;
}

type FormValues = {
  columnMappings: Array<ColumnMapping>;
};

const filter = createFilterOptions<string>();

// eslint-disable-next-line max-len
const ConfigureColumnMappingDialog: React.FC<ConfigureColumnMappingDialogProps> = ({
  contactsFile,
  onSave,
  onClose,
  open
}) => {
  const [parseComplete, setParseComplete] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();

  const { handleSubmit, watch, control, reset } = useForm<FormValues>({
    defaultValues: { columnMappings: [] as ColumnMapping[] }
  });

  const { fields } = useFieldArray({
    control,
    name: "columnMappings"
  });
  const watchFieldArray = watch("columnMappings");
  const controlledFields = fields.map((field, index) => ({
    ...field,
    ...watchFieldArray[index]
  }));

  const checkKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
    }
  };

  useEffect(() => {
    if (open && contactsFile) {
      Papa.parse(contactsFile, {
        header: true,
        preview: 2,
        complete: (results: ParseResult<any>) => {
          const columnMappings = results?.meta?.fields?.map((h) => {
            const header = h.trim() as namedFieldsKeys;
            return {
              column: header,
              remap: (namedFields[header] as fieldAliasKeys) ?? null
            };
          });

          if (columnMappings) reset({ columnMappings });
          setParseComplete(true);
        }
      });
    }
  }, [contactsFile]);

  const handleSave = (formValues: FormValues) => {
    const mappedColumns = formValues.columnMappings.filter((column) =>
      Boolean(column.remap)
    );

    const remappedFields = mappedColumns.map((column) => column.remap);

    const missingFields = requiredUploadFields.filter(
      (requiredUploadField) => !remappedFields.includes(requiredUploadField)
    );

    if (missingFields.length > 0) {
      setError(`Required Fields Missing!!! ${missingFields.join(", ")}`);
      return;
    }

    // Duplicate remap names found
    if (remappedFields.length !== uniq(remappedFields).length) {
      setError("Duplicate fields found. You can only use a field name once");
      return;
    }

    const remappedColumns = mappedColumns.map((column) => {
      if (column.remap) {
        const alias = fieldAliases[column.remap] as fieldAliasKeys;
        return {
          column: column.column,
          remap: alias ?? column.remap
        };
      }
      return {} as ColumnMapping;
    });

    setError(null);
    onSave(remappedColumns);
  };

  // Eslint disable is required here to prevent enter from submitting form
  // Enter key is used to lock in the freesolo option in autocomplete
  // https://github.com/react-hook-form/react-hook-form/discussions/2549
  /* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
  return (
    <Dialog open={open} onClose={onClose}>
      <form
        onSubmit={handleSubmit(handleSave)}
        onKeyDown={(e) => checkKeyDown(e)}
      >
        <DialogTitle>Configure Column Mapping</DialogTitle>
        <DialogContent>
          {error && (
            <div style={{ color: theme.palette.warning.main }}>
              {error}
              <br />
            </div>
          )}
          {parseComplete ? (
            <div>
              {" "}
              Required Headers: First Name, Last Name, Cell Phone <br /> <br />
              Optional Headers: Zip, External ID
              {controlledFields.map((arrayField, index) => (
                <Grid
                  container
                  spacing={2}
                  justifyContent="center"
                  alignItems="center"
                  key={arrayField.id}
                >
                  <Grid item>
                    <Controller
                      name={`columnMappings.${index}.column`}
                      control={control}
                      render={({
                        field,
                        fieldState: { error: fieldError }
                      }) => (
                        <TextField
                          {...field}
                          style={{ width: 200 }}
                          variant="outlined"
                          InputProps={{ readOnly: true }}
                          error={fieldError !== undefined}
                          helperText={fieldError?.message}
                        />
                      )}
                    />
                  </Grid>
                  <Grid item>
                    <ArrowForwardIcon />
                  </Grid>
                  <Grid item>
                    <Controller
                      name={`columnMappings.${index}.remap`}
                      control={control}
                      render={({
                        field: { onChange, value },
                        fieldState: { error: fieldError }
                      }) => (
                        <Autocomplete
                          value={value}
                          onChange={(_event, newValue) => {
                            onChange(newValue);
                          }}
                          selectOnFocus
                          clearOnBlur
                          handleHomeEndKeys
                          options={friendlyFieldNames}
                          fullWidth
                          freeSolo
                          filterOptions={(
                            options: string[],
                            params: FilterOptionsState<string>
                          ) => {
                            const filtered = filter(options, params);

                            if (params.inputValue !== "") {
                              filtered.push(`Create as "${params.inputValue}"`);
                            }

                            return filtered;
                          }}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              style={{ width: 200 }}
                              variant="outlined"
                              error={fieldError !== undefined}
                              helperText={fieldError?.message}
                              label="Remap To"
                            />
                          )}
                        />
                      )}
                    />
                  </Grid>
                </Grid>
              ))}
            </div>
          ) : (
            <LoadingIndicator />
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="contained" color="primary" type="submit">
            Save
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default ConfigureColumnMappingDialog;
