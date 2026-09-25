import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { ApiDocs } from "./ApiDocs.tsx";
import { Landing } from "./Landing.tsx";
import { Pricing } from "./Pricing.tsx";
import { Solutions } from "./Solutions.tsx";
import { currentRoute } from "./lib/routes.ts";
import "./styles.css";

const path = currentRoute();
const page =
  path === "/api-docs" ? (
    <ApiDocs />
  ) : path === "/solutions" ? (
    <Solutions />
  ) : path === "/pricing" ? (
    <Pricing />
  ) : path === "/app" ? (
    <App />
  ) : (
    <Landing />
  );

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{page}</React.StrictMode>,
);
