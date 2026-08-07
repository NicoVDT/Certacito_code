
  import { createRoot } from "react-dom/client";
  import App from "./app/App";
  import "./styles/index.css";

  // entrypoint - just mount App on #root. nothing else to do here really
  createRoot(document.getElementById("root")!).render(<App />);
