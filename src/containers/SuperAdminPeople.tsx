import React, { useState } from "react";

import OrganizationSelector from "../components/OrganizationSelector";
import AdminPeople from "./AdminPeople";

const SuperAdminPeople: React.FC = (_props) => {
  const [organizationId, setOrganizationId] = useState<string>();
  const handleOrgChanged = (selectedOrgId: string) => {
    setOrganizationId(selectedOrgId);
  };

  return (
    <>
      <OrganizationSelector
        onChange={handleOrgChanged}
        style={{ width: 300 }}
      />
      {organizationId && <AdminPeople organizationId={organizationId} />}
    </>
  );
};

export default SuperAdminPeople;
