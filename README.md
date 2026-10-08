# PTCGL Deck Swapper

App web (somente front-end) para importar uma lista do Pokémon TCG Live, trocar a impressão de cada carta por uma versão equivalente e exportar a lista editada no formato PTCGL.

Vue 3 + Vite + TypeScript, Vitest. Dados de cartas: [pokemontcg.io v2](https://api.pokemontcg.io/v2).

## Como rodar

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest (sem chamadas à API real)
npm run build      # typecheck + build de produção
```

A chave da API é opcional (aumenta o limite de requisições). Para usar, copie `.env.example` para `.env.local` e preencha `VITE_POKEMONTCG_API_KEY`. Ela só é enviada no header `X-Api-Key` se estiver definida.

## Deploy automático (GitHub Actions)

O workflow `.github/workflows/deploy.yml` faz o seguinte:
- **Pull request:** roda os testes e o build.
- **Push na `main`** (ou execução manual em *Actions → Deploy → Run workflow*): roda os testes e o build e, se tudo passar, envia `dist/` para o servidor com `rsync` via SSH. Os arquivos novos entram todos de uma vez no final, então ninguém vê o site pela metade.

### Configuração (uma vez)

1. **Crie uma chave SSH só para o deploy** (na sua máquina):
   ```bash
   ssh-keygen -t ed25519 -N "" -C "github-deploy" -f deploy_key
   ```
2. **Autorize a chave no servidor:** adicione o conteúdo de `deploy_key.pub` ao `~/.ssh/authorized_keys` do usuário de deploy. Esse usuário precisa ter permissão de escrita na pasta do site (ex.: `/var/www/ptcgl-swapper`) e o servidor precisa ter `rsync` instalado.
3. **Pegue a chave do host** (fixa a identidade do servidor, para o deploy não aceitar um servidor falso):
   ```bash
   ssh-keyscan -p 22 seu-servidor.com
   ```
4. **Cadastre os secrets** em *Settings → Environments → production* (ou em *Settings → Secrets and variables → Actions*):

   | Secret | Exemplo |
   |---|---|
   | `SSH_HOST` | `seu-servidor.com` |
   | `SSH_USER` | `deploy` |
   | `SSH_PORT` | `22` (opcional) |
   | `SSH_PRIVATE_KEY` | conteúdo de `deploy_key` (a chave **privada**) |
   | `SSH_KNOWN_HOSTS` | saída do `ssh-keyscan` |
   | `DEPLOY_PATH` | `/var/www/ptcgl-swapper` |
   | `VITE_POKEMONTCG_API_KEY` | opcional; fica visível no JavaScript publicado |

   Com o GitHub CLI: `gh secret set SSH_PRIVATE_KEY --env production < deploy_key` (e assim por diante).
5. Apague `deploy_key` da sua máquina depois de cadastrar.

Opcional: no environment `production` dá para exigir aprovação manual antes de cada deploy (*Required reviewers*).

## Estrutura

- `src/lib/`: lógica pura (parser, exportador, equivalência, normalização, operações do deck)
- `src/services/`: API (`tcgApi.ts`), cache com TTL (`cache.ts`), retry/limite de concorrência (`http.ts`), busca de alternativas (`alternatives.ts`)
- `src/composables/useDeck.ts`: estado do deck (importar, trocar, desfazer, avisos, exportação)
- `src/config/legalMarks.ts`: marcas de regulamento legais (**confirme no site oficial a cada rotação**)
- `src/config/setsSnapshot.ts`: cópia de `/v2/sets` usada só se `/sets` falhar

## O que foi confirmado na API (requisições reais em 2026-10-08)

- **Nomes de energia básica variam:** sets antigos usam `"Fire Energy"`; os da era SV usam `"Basic Fire Energy"`. A busca por tipo carrega `supertype:Energy subtypes:Basic` uma vez (cerca de 183 cartas) e filtra pelo nome de forma tolerante (`^(basic )?<tipo> energy$`).
- **Energias básicas não têm `types`**, e `regulationMark` costuma vir `null`. Por isso o tipo vem do nome, e energia básica nunca recebe aviso de marca.
- **Não existe set com `ptcgoCode` `MEE`** na API. Por isso as energias `MEE n` ficam "não resolvidas", mas o modal continua oferecendo as artes do mesmo tipo com base na letra.
- **Um `ptcgoCode` pode mapear para vários sets:** `SIT` → `swsh12` e `swsh12tg`; `CRZ`, `BRS`, `30C` etc. também. Promos: `PR-SV` → `svp`.
- **O `set` embutido na carta às vezes não tem `ptcgoCode`** (ex.: `sv1-258`, `sv3-230`). O código PTCGL sempre vem do mapa montado a partir de `/sets`.
- **`number` é string** e não tem zeros à esquerda (`"7"`, `"85"`). Também existem números com letras (`"TG24"`, `"SWSH251"`). Os números são normalizados antes da comparação.
- Campos confirmados: `supertype` (`"Pokémon"`, `"Trainer"`, `"Energy"`), `subtypes`, `hp` (string), `types`, `abilities[{name,text,type}]`, `attacks[{name,cost,damage,text}]`, `weaknesses/resistances[{type,value}]`, `retreatCost`, `rules`, `regulationMark`, `set.id`, `set.releaseDate`, `images.small`.
- **Gallery do PTCGL:** o PTCGL escreve `LOR-TG 24`, e na API a carta fica no set `swsh11tg` com número `"TG24"` (com dois dígitos: `TG05`). O app converte nos dois sentidos (`src/lib/printId.ts`).
- **O texto dos treinadores muda entre eras sem mudar o efeito:** Boss's Orders RCL/BRS/LOR têm *"Switch 1 of your opponent's Benched Pokémon with their Active Pokémon."*, e MEG/ASC têm *"Switch in 1 … to the Active Spot."*.
- **Nomes com símbolo:** `Telepathic {P} Energy` (PTCGL) aparece como `Telepathic Psychic Energy` na API. A busca por nome expande os símbolos.
- **A busca `name:"Boss's Orders"` também devolve "Boss's Orders (Ghetsis)"**, então o filtro de nome exato é feito no cliente.
- Apóstrofo e acentos funcionam dentro de frase entre aspas (`name:"Pokémon Catcher"`). Só `"` e `\` são escapados, e aspas tipográficas são convertidas antes.
- **A API é instável:** responde 500/502 com frequência e às vezes leva cerca de 20 s. Há retry com backoff exponencial para rede, 429 e 5xx, e no máximo 3 requisições simultâneas. Se `/sets` falhar, o app usa o snapshot embutido.

## Suposições

- A regex de linha foi estendida para aceitar número com prefixo de letras (`TG12`), além do formato base.
- Cabeçalhos em inglês ou português (`Trainer`/`Treinador`, `Energy`/`Energia`) são aceitos, e a exportação usa os mesmos rótulos da entrada. A linha final `Total Cards: N` / `Total de cartas: N` é mantida se existir.
- O número do cabeçalho pode contar **cópias** (padrão) ou **linhas** (como numa lista exportada em português: `Pokémon: 15` com 24 cartas). O app detecta qual convenção a lista usa e a mantém na exportação. Se nenhuma bater, aparece um aviso não bloqueante e o total é recalculado.
- **Treinadores:** o modal mostra todas as impressões com o mesmo nome exato, sem comparar o texto (decisão do usuário, já que o texto muda entre eras). Pokémon continuam separados em "Equivalentes" / "Não equivalentes".
- Na troca, o nome exportado continua sendo o da linha original (as alternativas têm o mesmo nome), exceto em energias básicas, cujo nome é sempre `Basic {X} Energy`.
- Códigos que não existem na API (ex.: `SVALT`, `MEP`, `MEE`) caem na busca por nome. A carta aparece com "≈" e é exportada exatamente como veio.
- Seções vazias são omitidas na exportação.
- Se a impressão exata não for encontrada, mas o nome for, a carta aparece com a arte de outra versão, marcada com "≈" e um aviso, e é exportada exatamente como veio.
- Alternativas de sets sem `ptcgoCode` são escondidas, porque não poderiam ser exportadas. As energias incluem artes antigas (ex.: Base Set) que talvez não existam no PTCGL.
- O "Desfazer" funciona como uma pilha (cada clique desfaz uma troca).
- Cache: respostas de cartas ficam 24 h, e `/sets` fica 7 dias (memória + `localStorage`).
