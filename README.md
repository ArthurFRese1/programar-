# CodeTree Mobile — V4 corrigida

Editor web de HTML, CSS e JavaScript com árvore de arquivos, abas, armazenamento local e prévia integrada.

## Prévia do projeto
- Use **▶ Prévia** na barra superior para abrir a prévia ocupando toda a área de trabalho.
- O mesmo botão muda para **■ Fechar prévia** e encerra a visualização.
- A prévia atualiza automaticamente após alterações no editor, e também pode ser atualizada pelo botão **Atualizar**.
- Se houver um arquivo HTML aberto, ele será usado como página inicial da prévia; caso contrário, tenta `index.html` e depois outro HTML.
- CSS e JavaScript locais referenciados pelo HTML são incorporados à prévia.
- Iframes que apontam para arquivos HTML locais do projeto são convertidos para documentos incorporados, para que caminhos como `Cadastro de Pessoas.html` funcionem mesmo sem um servidor HTTP real.

## Limitações
A prévia é uma simulação com `iframe` e `srcdoc`, não um servidor HTTP real. Recursos que dependam de backend, módulos ES, requisições relativas complexas, APIs que exigem origem HTTP ou recursos externos podem não funcionar exatamente como em hospedagem real. Para testar esses casos, será necessário um servidor de verdade.

## Executar
Abra `index.html` num navegador moderno. A biblioteca CodeMirror e o JSZip são carregados por CDN, então a primeira abertura requer conexão com a internet.

## Arquivos
- `index.html`: interface.
- `style.css`: estilos.
- `app.js`: lógica do editor e da prévia.
