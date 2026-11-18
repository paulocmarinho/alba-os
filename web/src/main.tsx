import { createRoot } from "react-dom/client";
import { Alba } from "./Alba";
import { AlbaCasca } from "./Casca";
import { naCasca } from "./ponte";
import { TelaEntrada } from "./componentes/TelaEntrada";
import { blindar } from "./blindagem";
import "./estilos.css";
import "./alba-base.css";
import "./alba.css";

blindar();
if (naCasca) document.documentElement.classList.add("na-casca");
const entrada = new URLSearchParams(location.search).get("entrada") === "1";
if (entrada) document.documentElement.classList.add("na-entrada");
createRoot(document.getElementById("raiz")!).render(entrada ? <TelaEntrada /> : naCasca ? <AlbaCasca /> : <Alba />);
