import { createRoot } from "react-dom/client";
import { Alba } from "./Alba";
import { blindar } from "./blindagem";
import "./estilos.css";
import "./alba-base.css";
import "./alba.css";

blindar();
createRoot(document.getElementById("raiz")!).render(<Alba />);
