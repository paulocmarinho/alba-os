import { createRoot } from "react-dom/client";
import { Alba } from "./Alba";
import { AlbaCasca } from "./Casca";
import { naCasca } from "./ponte";
import { blindar } from "./blindagem";
import "./estilos.css";
import "./alba-base.css";
import "./alba.css";

blindar();
if (naCasca) document.documentElement.classList.add("na-casca");
createRoot(document.getElementById("raiz")!).render(naCasca ? <AlbaCasca /> : <Alba />);
