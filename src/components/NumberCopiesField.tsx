import TextField from "@material-ui/core/TextField";
import React from "react";

export interface NumberCopiesFieldProps {
  qty: number;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
}

export const NumberCopiesField: React.FC<NumberCopiesFieldProps> = (props) => {
  const handleQtyChange: React.ChangeEventHandler<HTMLInputElement> = (
    event
  ) => {
    const newQty = event.target.valueAsNumber;
    // Enforce 20 copy limit based on Spoke client team feedback
    // https://github.com/politics-rewired/Spoke/issues/1608#issuecomment-1547025486
    if (newQty > 0 && newQty < 21) props.onChange(event);
  };

  return (
    <TextField
      label="Quantity (max 20)"
      type="number"
      value={props.qty}
      onChange={handleQtyChange}
      onFocus={(event) => event.target.select()}
    />
  );
};

export default NumberCopiesField;
