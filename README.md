# Claude Config Sync

Um botão na barra de status do VS Code que deixa o **Claude Code igual em vários computadores** (por exemplo, casa no Windows e trabalho no Linux).

- **Regras, memórias, skills, agents e estilos** vão pelo **GitHub** (um repositório privado seu).
- **Conversas** vão pelo **Google Drive** (com o `rclone`), porque são grandes e só crescem.
- **Segredos** (senhas, tokens) nunca entram: ficam no seu cofre de senhas.

Princípio: **juntar, nunca substituir.** Antes de trocar qualquer arquivo, a extensão faz backup em `~/.claude/backups/`.

## Como funciona

| Situação | O que acontece |
|---|---|
| Arquivo novo só neste PC | envia para a nuvem sozinho |
| Arquivo novo só na nuvem | traz sozinho |
| Mudou só de um lado desde a última vez | copia para o outro lado sozinho |
| Mudou nos dois lados, ou foi apagado de um lado | vira **pendência**: você escolhe Enviar, Trazer, Ignorar ou Ver diferenças |
| `CLAUDE.md` (instruções globais) | sempre pendência: o Claude propõe a mescla e só grava com a sua aprovação |

A barra mostra `✓ Claude: tudo igual` ou `⟳ Claude: 2 pendências`. Um clique sincroniza ou abre as pendências.
Ela sincroniza sozinha ao **abrir** e ao **fechar** o VS Code e confere novidades a cada 30 minutos (só confere, não altera).

### Casa e trabalho

Cada computador tem um perfil (comando **Claude Sync: Este computador é casa ou trabalho?**):

- **casa**: recebe as conversas do trabalho e aceita todas as memórias.
- **trabalho**: nunca recebe conversas de casa; memória pessoal (tipo `user` ou `project`) só entra com a sua decisão.

## Requisitos

- Repositório `claude-config` clonado em `~/claude-config`, com o motor `scripts/sincronizar/sincronizar.py` (ou indique outro caminho em `claudeSync.motor`).
- Python 3 (`py` no Windows, `python3` no Linux).
- Git com acesso ao repositório (por exemplo, `gh auth login`).
- Para as conversas: `rclone` com um remoto chamado `gdrive` (Google Drive).

## Configurações

| Chave | Padrão | Para quê |
|---|---|---|
| `claudeSync.aoAbrir` | `true` | sincronizar ao abrir |
| `claudeSync.aoFechar` | `true` | sincronizar ao fechar |
| `claudeSync.conversas` | `true` | copiar conversas pelo Drive |
| `claudeSync.intervaloMin` | `30` | conferir novidades a cada N minutos (0 = nunca) |
| `claudeSync.motor` | vazio | caminho do `sincronizar.py` |
| `claudeSync.python` | vazio | comando do Python |

## Comandos

- **Claude Sync: Sincronizar agora**
- **Claude Sync: Resolver pendências**
- **Claude Sync: Copiar conversas agora**
- **Claude Sync: Este computador é casa ou trabalho?**
- **Claude Sync: Ver registro**
