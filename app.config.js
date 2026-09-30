const app = require("./app.json").expo;

// GitHub project pages are served from /SwoleMates. Local Expo keeps the root path.
const basePath = process.env.EXPO_PUBLIC_BASE_PATH;

module.exports = {
  expo: {
    ...app,
    experiments: {
      ...app.experiments,
      ...(basePath ? { baseUrl: basePath } : {}),
    },
    web: {
      ...app.web,
      output: "single",
    },
  },
};
