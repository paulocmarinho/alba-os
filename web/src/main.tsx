import { createRoot } from "react-dom/client";
import { Lumen } from "./Lumen";
import "./estilos.css";
import "./lumen.css";

createRoot(document.getElementById("raiz")!).render(<Lumen />);
