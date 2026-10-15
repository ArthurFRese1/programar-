# CodeTree Mobile

Primeira versão de um gerenciador e editor de projetos web, pensado para celular e hospedagem estática no GitHub Pages.

## O que já funciona
- Árvore de pastas e arquivos.
- Criar arquivos e pastas, inclusive subpastas.
- Renomear e excluir itens.
- Abas para alternar entre arquivos.
- Editor com realce de sintaxe para HTML, CSS e JavaScript.
- Salvamento automático no IndexedDB do navegador.
- Importar projeto ZIP e exportar ZIP.
- Conectar uma pasta real com permissão de leitura e escrita (File System Access API, em navegadores compatíveis).
- Gravar automaticamente as alterações do editor nos arquivos reais quando a pasta estiver conectada e a permissão de escrita for concedida.
- Criar e excluir itens na pasta conectada; renomeação de pastas depende do suporte do navegador.
- Importar pasta como cópia quando o navegador não oferecer acesso direto.
- Baixar o arquivo aberto.
- Layout responsivo para celular e computador.

## Executar localmente
1. Extraia o ZIP.
2. Abra `index.html` no navegador. Para evitar restrições de alguns navegadores, prefira um servidor local simples:
   - No VS Code, instale/ative Live Server e clique em **Go Live**; ou
   - com Python instalado, abra o terminal na pasta e rode `python -m http.server 8000`, depois abra `http://localhost:8000`.

As bibliotecas CodeMirror e JSZip são carregadas por CDN, portanto o editor com realce e o ZIP precisam de internet.

## Publicar no GitHub Pages
1. Crie um repositório no GitHub, por exemplo `codetree-mobile`.
2. Envie `index.html`, `style.css`, `app.js` e `README.md` para a raiz do repositório.
3. No GitHub, entre em **Settings → Pages**.
4. Em **Build and deployment**, escolha **Deploy from a branch**.
5. Selecione a branch `main` e a pasta `/ (root)`, depois clique em **Save**.
6. Aguarde a publicação. A URL será parecida com `https://SEU-USUARIO.github.io/codetree-mobile/`.

## Observações importantes
- O salvamento é local ao navegador e dispositivo. Limpar os dados do site pode apagar projetos salvos. Exporte backups ZIP.
- O site não envia arquivos a um servidor.
- Para salvar diretamente em arquivos existentes, abra o site em um navegador compatível (normalmente Chrome ou Edge em computador), clique em **Conectar pasta** e conceda permissão de leitura e escrita. O site precisa estar em contexto seguro: HTTPS (GitHub Pages) ou localhost.
- Se o navegador não oferecer a API de acesso a pastas, o seletor alternativo importa uma cópia; nesse modo, alterações não são gravadas na pasta original.
- A permissão pode precisar ser concedida novamente em outra sessão. O site não pode ultrapassar as permissões dadas pelo navegador.
- GitHub Pages hospeda os arquivos do site, mas não sincroniza seus projetos pessoais entre dispositivos.
- Este MVP importa arquivos de texto. Arquivos binários (imagens, fontes, executáveis etc.) não são preservados corretamente na importação de ZIP nesta versão.
