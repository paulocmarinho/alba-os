#!/usr/bin/env bash
# Sonda da API do Flathub (formato das respostas) para a Alba Store.
mkdir -p saida
curl -sS https://flathub.org/api/v2/appstream/com.spotify.Client > saida/appstream.json
curl -sS https://flathub.org/api/v2/summary/com.spotify.Client > saida/summary.json
curl -sS -X POST -H 'Content-Type: application/json' -d '{"query":"spotify","filters":[]}' https://flathub.org/api/v2/search > saida/search.json
curl -sS "https://flathub.org/api/v2/search?locale=pt_BR" -X POST -H 'Content-Type: application/json' -d '{"query":"editor de video"}' > saida/search-pt.json
curl -sS https://flathub.org/api/v2/popular/last-month > saida/popular.json
curl -sS https://flathub.org/api/v2/collection/popular > saida/collection-popular.json
pacman -S --noconfirm --needed flatpak > saida/pacman-flatpak.txt 2>&1
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo > saida/flatpak-remote.txt 2>&1
timeout 900 flatpak install --user -y --noninteractive flathub com.spotify.Client > saida/flatpak-install.txt 2>&1; echo "codigo $?" >> saida/flatpak-install.txt
flatpak list --user --app --columns=application,name,version,size > saida/flatpak-list.txt 2>&1
ls ~/.local/share/flatpak/exports/share/applications > saida/exports.txt 2>&1
python3 -c "import json;d=json.load(open('saida/appstream.json'));print(list(d.keys()))" > saida/chaves.txt 2>&1
