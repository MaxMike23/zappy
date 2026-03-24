import client from "./client";

export const connectionsApi = {
  list:   (projectId, trade)      => client.get(`/projects/${projectId}/connections`, { params: trade ? { trade } : {} }),
  create: (projectId, data)       => client.post(`/projects/${projectId}/connections`, data),
  update: (projectId, id, data)   => client.put(`/projects/${projectId}/connections/${id}`, data),
  remove: (projectId, id)         => client.delete(`/projects/${projectId}/connections/${id}`),
};
