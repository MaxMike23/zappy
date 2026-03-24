import client from "./client";

export const projectDevicesApi = {
  list:           (projectId)                   => client.get(`/projects/${projectId}/devices`),
  add:            (projectId, data)             => client.post(`/projects/${projectId}/devices`, data),
  update:         (projectId, id, data)         => client.put(`/projects/${projectId}/devices/${id}`, data),
  remove:         (projectId, id)               => client.delete(`/projects/${projectId}/devices/${id}`),
  updatePosition: (projectId, id, trade, pos)   => client.patch(`/projects/${projectId}/devices/${id}/position`, { trade, position: pos }),
};
