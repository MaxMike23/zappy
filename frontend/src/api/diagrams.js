import client from "./client";

export const diagramsApi = {
  get:    (projectId, trade)      => client.get(`/projects/${projectId}/diagrams/${trade}`),
  upsert: (projectId, trade, data) => client.put(`/projects/${projectId}/diagrams/${trade}`, data),
};
