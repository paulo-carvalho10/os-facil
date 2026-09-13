# OS Fácil

Aplicativo de ordens de serviço para assistências técnicas, desenvolvido como projeto de portfólio. Permite cadastrar atendimentos, acompanhar etapas de reparo, registrar fotos e consultar o andamento por um portal do cliente.

**[Abrir demonstração pública](https://paulo-carvalho10.github.io/os-facil/)** · Sem cadastro ou senha.

![Painel com ordens fictícias](docs/painel-desktop.png)

## Experimente

1. Abra a demonstração e explore as oito ordens fictícias.
2. Busque um cliente ou filtre as ordens por status.
3. Abra uma OS para ver os dados do aparelho e atualizar a etapa.
4. Cadastre uma nova OS, adicione uma foto de teste e explore a impressão.
5. Use **Abrir** no cartão Portal do cliente para visualizar o acompanhamento.
6. Clique em **Recarregar demonstração** para restaurar os exemplos. Isso apaga as alterações locais da demonstração.

A demonstração usa IndexedDB no seu navegador. Não envia dados ao Supabase, não exige login e não compartilha alterações entre visitantes. Use apenas dados fictícios. Os links de acompanhamento dessa versão dependem dos dados do mesmo navegador.

## Funcionalidades

- Cadastro de cliente, aparelho, defeito, acessórios e orçamento.
- Busca, filtros e resumo de atendimentos.
- Seis etapas de reparo e histórico de alterações.
- Fotos pela galeria ou câmera, reduzidas antes de salvar.
- Assinatura em canvas e estilos de impressão A4/80 mm.
- Portal por código aleatório, sem exibir dados pessoais, fotos ou notas internas.
- Leitura de códigos quando o navegador oferece BarcodeDetector.
- Persistência local das alterações.

## Integração com Supabase

![Detalhes da ordem de serviço](docs/detalhe-os.png)

![Portal de acompanhamento do cliente](docs/portal-cliente.png)

O código também inclui uma versão conectada: login por e-mail e senha, autorização de operadores por RLS, fotos privadas e sincronização periódica entre dispositivos. Essa integração foi verificada separadamente com criação de OS, envio de foto e consulta em dois navegadores.

A demonstração pública é compilada em modo `demo`, que desativa o cliente Supabase mesmo se houver configuração local. A versão conectada exige seu próprio ambiente e operadores autorizados. Veja [SUPABASE.md](SUPABASE.md) e [ARQUITETURA.md](ARQUITETURA.md).

## Tecnologias

| Área | Tecnologias |
| --- | --- |
| Interface | React 19, TypeScript, Vite, React Router, Lucide |
| Estilos | CSS e Tailwind CSS 4 |
| Dados locais | Dexie / IndexedDB |
| Backend opcional | Supabase Auth, PostgreSQL, RLS e Storage |
| Verificação | Vitest, fake-indexeddb e testes SQL de integração |
| Publicação | GitHub Pages e GitHub Actions |

## Executar localmente

Requer Node.js 24 e pnpm 11.

```sh
pnpm install
pnpm dev --mode demo
```

Para usar Supabase, configure as variáveis de `.env.example` em `.env.local`, aplique as migrações e execute `pnpm dev`. Nunca coloque chaves secretas em variáveis com prefixo `VITE_`.

```sh
pnpm test
pnpm build:demo
```

O workflow publica a pasta `dist` no GitHub Pages após os testes. Rotas da demonstração usam hash para permitir navegação e recarregamento sem configuração de servidor.

## Validação e limites

13 testes automatizados locais aprovados, além de verificações SQL de RLS, autorização, idempotência e privacidade. O fluxo conectado foi testado com login humano, criação de OS, upload privado e sincronização entre Codex e Opera.

Este é um MVP de portfólio, não um produto pronto para operação comercial. Ainda não foram validados impressão física, instalação PWA e reabertura completamente offline. A demonstração no Pages não registra service worker. Recuperação de senha na interface, backup operacional e testes de conflitos simultâneos permanecem pendentes. Câmera e leitura de códigos dependem do navegador e de permissão do visitante.

Estoque, nota fiscal, pagamentos e multiempresa estão fora do escopo atual: [V2.md](V2.md).

Desenvolvido por [Paulo Carvalho](https://github.com/paulo-carvalho10).
