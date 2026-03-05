import client from "./client";

export const workflowApi = {
  listStages: (module) => client.get("/workflow/stages", { params: module ? { module } : {} }),
  listFields: (module) => client.get("/workflow/fields", { params: module ? { module } : {} }),
};
