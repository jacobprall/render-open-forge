import type { ForgejoClient } from "@/lib/forgejo/client";

export async function createOrg(
  client: ForgejoClient,
  login: string,
  fullName?: string,
  description?: string,
) {
  return client.createOrg(login, { full_name: fullName, description });
}

export async function deleteOrg(client: ForgejoClient, orgName: string) {
  return client.deleteOrg(orgName);
}

export async function listOrgMembers(client: ForgejoClient, orgName: string) {
  return client.listOrgMembers(orgName);
}

export async function addOrgMember(
  client: ForgejoClient,
  orgName: string,
  username: string,
) {
  return client.addOrgMember(orgName, username);
}

export async function removeOrgMember(
  client: ForgejoClient,
  orgName: string,
  username: string,
) {
  return client.removeOrgMember(orgName, username);
}

export async function listUserOrgs(client: ForgejoClient) {
  return client.listUserOrgs();
}
