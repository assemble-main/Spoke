import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import DialogTitle from "@material-ui/core/DialogTitle";
import React from "react";

import { dataTest } from "../../../lib/attributes";
import UserEdit from "../../UserEdit";
import OrganizationJoinLink from "./OrganizationJoinLink";
import PasswordResetLink from "./PasswordResetLink";

interface EditPersonProps {
  open: boolean;
  afterEditing: () => void;
  organizationId: string;
  userId: string;
}

const EditPerson: React.FC<EditPersonProps> = ({
  open,
  afterEditing,
  organizationId,
  userId
}) => (
  <Dialog {...dataTest("editPersonDialog")} open={open} onClose={afterEditing}>
    <DialogTitle>Edit user</DialogTitle>
    <DialogContent>
      <UserEdit
        organizationId={organizationId}
        userId={userId}
        onRequestClose={afterEditing}
      />
    </DialogContent>
  </Dialog>
);

interface InvitePersonProps {
  organizationUUID: string;
  open: boolean;
  onClose: () => void;
}

const InvitePerson: React.StatelessComponent<InvitePersonProps> = ({
  open,
  onClose,
  organizationUUID
}) => (
  <Dialog open={open} onClose={onClose}>
    <DialogTitle>Invite new texters</DialogTitle>
    <DialogContent>
      <OrganizationJoinLink organizationUuid={organizationUUID} />
    </DialogContent>
    <DialogActions>
      <Button
        key="ok"
        {...dataTest("inviteOk")}
        color="primary"
        onClick={onClose}
      >
        OK
      </Button>
    </DialogActions>
  </Dialog>
);

interface ResetPasswordProps {
  open: boolean;
  onClose: () => void;
  passwordResetHash: string;
}

const ResetPassword: React.StatelessComponent<ResetPasswordProps> = ({
  open,
  onClose,
  passwordResetHash
}) => (
  <div>
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Reset user password</DialogTitle>
      <DialogContent>
        <PasswordResetLink passwordResetHash={passwordResetHash} />
      </DialogContent>
      <DialogActions>
        <Button
          key="ok"
          {...dataTest("passResetOK")}
          color="primary"
          onClick={onClose}
        >
          OK
        </Button>
      </DialogActions>
    </Dialog>
  </div>
);

interface ConfirmSuperAdminProps {
  open: boolean;
  onClose: () => void;
  handleConfirmSuperadmin: () => void;
}

const ConfirmSuperAdmin: React.StatelessComponent<ConfirmSuperAdminProps> = ({
  open,
  onClose,
  handleConfirmSuperadmin
}) => (
  <div>
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Confirm Superadmin</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Are you sure you want to make this user a Superadmin? Superadmins have
          Owner permissions for all organizations and can manage other
          Superadmins.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button
          key="cancel"
          {...dataTest("superAdminOk")}
          color="primary"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          key="ok"
          {...dataTest("superAdminOk")}
          color="primary"
          onClick={handleConfirmSuperadmin}
        >
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  </div>
);

interface ConfirmUnassignTextsProps {
  open: boolean;
  onClose: () => void;
  handleConfirmUnassignTexts: (unassignTexts: boolean) => void;
}

const ConfirmUnassignTexts: React.StatelessComponent<ConfirmUnassignTextsProps> = ({
  open,
  onClose,
  handleConfirmUnassignTexts
}) => (
  <div>
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Unassign Texts for User?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          You've just suspended a user's account, do you want to unassign their
          texts? Unassigned texts will be able to be picked up by other texters.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button
          key="no"
          color="primary"
          onClick={() => handleConfirmUnassignTexts(false)}
        >
          No
        </Button>
        <Button
          key="yes"
          color="primary"
          onClick={() => handleConfirmUnassignTexts(true)}
        >
          Yes
        </Button>
      </DialogActions>
    </Dialog>
  </div>
);

interface ConfirmRemoveUsersProps {
  open: boolean;
  onClose: () => Promise<void> | void;
  onConfirmRemoveUsers: () => Promise<void> | void;
}

const ConfirmRemoveUsers: React.FC<ConfirmRemoveUsersProps> = ({
  open,
  onClose,
  onConfirmRemoveUsers
}) => (
  <Dialog open={open} onClose={onClose}>
    <DialogTitle>Confirm Remove Users</DialogTitle>
    <DialogContent>
      This will remove all users from the organization who are not Superadmins
      or Owners. Are you sure you would like to do this?
    </DialogContent>
    <DialogActions>
      <Button {...dataTest("removeUsersCancel")} onClick={onClose}>
        Cancel
      </Button>
      <Button
        {...dataTest("removeUsersOk")}
        onClick={onConfirmRemoveUsers}
        variant="contained"
        color="primary"
        autoFocus
      >
        Confirm
      </Button>
    </DialogActions>
  </Dialog>
);

const Dialogs = {
  InvitePerson,
  EditPerson,
  ResetPassword,
  ConfirmSuperAdmin,
  ConfirmUnassignTexts,
  ConfirmRemoveUsers
};
export default Dialogs;
