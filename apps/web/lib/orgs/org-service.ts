import type { ForgeProvider } from "@/lib/forge/client";

export async function createOrg(
  forge: ForgeProvider,
  login: string,
  fullName?: string,
  description?: string,
) {
  return forge.orgs.create(login, { fullName, description });
}

export async function deleteOrg(forge: ForgeProvider, orgName: string) {
  return forge.orgs.delete(orgName);
}

export async function listOrgMembers(forge: ForgeProvider, orgName: string) {
  return forge.orgs.listMembers(orgName);
}

export async function addOrgMember(
  forge: ForgeProvider,
  orgName: string,
  username: string,
) {
  return forge.orgs.addMember(orgName, username);
}

export async function removeOrgMember(
  forge: ForgeProvider,
  orgName: string,
  username: string,
) {
  return forge.orgs.removeMember(orgName, username);
}

export async function listUserOrgs(forge: ForgeProvider) {
  return forge.orgs.list();
}
