import client from "./client";

export const devicesApi = {
  list:        ()        => client.get("/devices/library"),
  listPending: ()        => client.get("/devices/library/pending"),
  create:      (data)    => client.post("/devices/library", data),
  update:      (id, data) => client.put(`/devices/library/${id}`, data),
  delete:      (id)      => client.delete(`/devices/library/${id}`),
  submit:      (id)      => client.post(`/devices/library/${id}/submit`),
  approve:     (id)      => client.post(`/devices/library/${id}/approve`),
  reject:      (id)      => client.post(`/devices/library/${id}/reject`),
};
