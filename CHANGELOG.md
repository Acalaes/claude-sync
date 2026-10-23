# Mudanças
## 0.3.0
- CLAUDE.md: "Mesclar agora (usa as suas regras)". O motor compara por seção e por item; barra o que as regras proíbem (termos em `~/.claude/sync-regras.json`, padrão do PC do trabalho: Windows, TOEFL, HKS…), e pergunta só o que é novo, numa lista de marcar. A decisão fica lembrada: na vez seguinte o `auto` mescla sozinho, sem perguntar.
- "Desfazer última mesclagem" (usa o backup) e "Atualizar agora" no menu e na paleta de comandos.
- A barra reconfere sozinha quando o CLAUDE.md ou a lista de ignorados mudam (acaba o "1 pendência" falso).
- "Mesclar com o Claude" agora abre o Claude Code com /sincronizar já escrito.
## 0.2.0
- Espaço no Drive no detalhe da barra: tamanho das conversas, quanto cresce por dia e projeção para 1 ano (histórico diário medido pelo motor).
- Motor: trava descartada quando o processo que a criou já morreu; envio tolera a conversa aberta crescendo; "trabalho ainda não enviou" não é mais erro.
## 0.1.0
- Nome na loja: Claude Config Sync (`Acalaes.claude-config-sync`; "claude-sync" já existia). Primeira versão: botão na barra de status, sincronização automática do que é seguro (ao abrir, ao fechar e por clique), pendências com Enviar / Trazer / Ignorar / Ver diferenças, perfis casa e trabalho, e conversas pelo Google Drive (rclone).
