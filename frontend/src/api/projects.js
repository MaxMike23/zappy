import client from "./client";

export const projectsApi = {
  list:    (params) => client.get("/projects/", { params }),
  get:     (id)     => client.get(`/projects/${id}`),
  create:  (data)   => client.post("/projects/", data),
  update:  (id, d)  => client.put(`/projects/${id}`, d),
  archive: (id)     => client.delete(`/projects/${id}`),
};
