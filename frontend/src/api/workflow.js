import client from "./client";

export const workflowApi = {
  // Stages
  listStages:   (module) => client.get("/workflow/stages", { params: module ? { module } : {} }),
  createStage:  (data)   => client.post("/workflow/stages", data),
  updateStage:  (id, data) => client.put(`/workflow/stages/${id}`, data),
  deleteStage:  (id)     => client.delete(`/workflow/stages/${id}`),
  reorderStages: (module, stageIds) => client.put("/workflow/stages/reorder", { module, stage_ids: stageIds }),

  // Field definitions
  listFields:   (module) => client.get("/workflow/fields", { params: module ? { module } : {} }),
  createField:  (data)   => client.post("/workflow/fields", data),
  updateField:  (id, data) => client.put(`/workflow/fields/${id}`, data),
  deleteField:  (id)     => client.delete(`/workflow/fields/${id}`),
};
