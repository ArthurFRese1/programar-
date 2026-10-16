
/* CodeTree Mobile — primeira versão funcional */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const DB_NAME = "codetree-mobile-db";
  const DB_VERSION = 1;
  let db, project, openTabs = [], activeId = null, editor, dirty = false, toastTimer;
  let rootDirHandle = null, diskWriteEnabled = false, changeVersion = 0, savingPromise = null;
  let previewRunning = false, previewUpdateTimer = null, lastPreviewUrl = null;
  const selectedIds = new Set();
  let visibleNodeIds = [];
  let dialogMode = "file", dialogParent = null, dialogTarget = null;
  const collapsed = new Set();

  const uid = () => "n_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const ext = name => (name.includes(".") ? name.split(".").pop().toLowerCase() : "");
  const langFor = name => ({html:"htmlmixed",htm:"htmlmixed",css:"css",js:"javascript",mjs:"javascript",cjs:"javascript",json:"javascript",md:"markdown"}[ext(name)] || "null");
  const iconFor = node => node.type === "folder" ? (collapsed.has(node.id) ? "📁" : "📂") : ({
    html:"🌐",htm:"🌐",css:"🎨",js:"🟨",mjs:"🟨",json:"🟧",md:"📝",svg:"🖼️",txt:"📄"
  }[ext(node.name)] || "📄");
  const allNodes = () => {
    const result = [];
    const walk = nodes => nodes.forEach(n => { result.push(n); if (n.type === "folder") walk(n.children); });
    walk(project.nodes); return result;
  };
  const findNode = id => allNodes().find(n => n.id === id);
  const findParentList = id => {
    const walk = nodes => { for (const n of nodes) { if (n.id === id) return nodes; if (n.type === "folder") { const found = walk(n.children); if (found) return found; } } return null; };
    return walk(project.nodes);
  };
  const pathOf = id => {
    const parts = [];
    const walk = (nodes, trail=[]) => { for (const n of nodes) { const next=[...trail,n.name]; if(n.id===id){parts.push(...next);return true;} if(n.type==="folder"&&walk(n.children,next))return true; } return false; };
    walk(project.nodes); return parts.join("/");
  };
  const defaultProject = () => ({name:"Meu projeto",nodes:[
    {id:uid(),type:"folder",name:"src",children:[
      {id:uid(),type:"file",name:"index.js",content:`// Seu JavaScript começa aqui
console.log('Olá, CodeTree!');
`},
      {id:uid(),type:"file",name:"style.css",content:`/* Seus estilos */
body {
  font-family: system-ui, sans-serif;
}
`}
    ]},
    {id:uid(),type:"file",name:"index.html",content:`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Meu projeto</title>
  <link rel="stylesheet" href="src/style.css">
</head>
<body>
  <h1>Olá, mundo!</h1>
  <script src="src/index.js"></script>
</body>
</html>
`}
  ]});
  function openDB() {
    return new Promise((resolve,reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => request.result.createObjectStore("projects");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  function dbGet(key) { return new Promise((resolve,reject) => { const r=db.transaction("projects").objectStore("projects").get(key); r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error); }); }
  function dbSet(key,value) { return new Promise((resolve,reject) => { const tx=db.transaction("projects","readwrite");tx.objectStore("projects").put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error); }); }
  async function writeNodeToDisk(node) {
    if (!diskWriteEnabled || !node || node.type !== "file" || !node.fsHandle) return false;
    try {
      const writable = await node.fsHandle.createWritable();
      await writable.write(node.content || "");
      await writable.close();
      return true;
    } catch (error) {
      diskWriteEnabled = false;
      $("storageStatus").textContent = "Sem permissão de escrita — salvo no navegador";
      showToast("Não consegui gravar na pasta. Verifique a permissão e reconecte-a.");
      return false;
    }
  }
  async function saveProject(silent=false, targetId=activeId) {
    if (savingPromise) {
      await savingPromise;
      if (dirty) return saveProject(silent, targetId);
      return;
    }
    const versionAtStart = changeVersion;
    if (editor && activeId) { const node=findNode(activeId); if(node && node.type==="file") node.content=editor.getValue(); }
    savingPromise = (async () => {
      await dbSet("main", project);
      const target = findNode(targetId);
      let diskSaved = false;
      if (target && target.type === "file" && target.fsHandle && diskWriteEnabled) diskSaved = await writeNodeToDisk(target);
      if (changeVersion === versionAtStart) {
        dirty=false;
        if ($("dirtyLabel")) $("dirtyLabel").textContent="Salvo";
      } else {
        dirty=true;
        if ($("dirtyLabel")) $("dirtyLabel").textContent="Alterações pendentes";
      }
      $("storageStatus").textContent = diskWriteEnabled ? (diskSaved ? "Salvo no arquivo e no navegador" : "Pasta conectada — salvamento automático a cada 60 s") : "Salvo neste navegador";
      if(!silent) showToast(diskSaved ? "Alterações gravadas no arquivo real." : "Projeto salvo neste navegador.");
    })();
    try { await savingPromise; }
    catch(e) { $("storageStatus").textContent="Falha ao salvar"; dirty=true; showToast("Não foi possível salvar. Verifique a permissão ou exporte um ZIP para backup."); }
    finally { savingPromise = null; }
  }
  function scheduleSave() {
    changeVersion++;
    dirty=true;
    $("dirtyLabel").textContent="Pendente — salva em até 60 s";
    $("storageStatus").textContent=diskWriteEnabled ? "Alterações pendentes — salvamento em até 60 s" : "Alterações pendentes — salvamento em até 60 s";
  }
  function updateSelectionControls() {
    const count = [...selectedIds].filter(id => !!findNode(id)).length;
    const deleteBtn = $("deleteSelectedBtn");
    if (deleteBtn) { deleteBtn.textContent = `Excluir selecionados (${count})`; deleteBtn.disabled = count === 0; }
    const selectBtn = $("selectVisibleBtn");
    if (selectBtn) selectBtn.textContent = visibleNodeIds.length && visibleNodeIds.every(id => selectedIds.has(id)) ? "Desmarcar visíveis" : "Selecionar visíveis";
  }
  function containsNode(folder, targetId) {
    return folder.type === "folder" && folder.children.some(child => child.id === targetId || containsNode(child, targetId));
  }
  function collectSubtreeIds(node, set) {
    set.add(node.id);
    if (node.type === "folder") node.children.forEach(child => collectSubtreeIds(child, set));
  }
  async function deleteSelectedNodes() {
    const selected = [...selectedIds].map(findNode).filter(Boolean);
    if (!selected.length) { showToast("Selecione pelo menos um arquivo ou pasta."); return; }
    const roots = selected.filter(node => !selected.some(other => other.id !== node.id && other.type === "folder" && containsNode(other, node.id)));
    const description = roots.length === 1 ? `Excluir “${roots[0].name}”` : `Excluir ${roots.length} itens selecionados`;
    if (!confirm(`${description}? Pastas selecionadas também terão todo o seu conteúdo excluído. Esta ação não pode ser desfeita.`)) return;
    let deletedCount = 0, failedCount = 0, activeWasDeleted = false;
    for (const node of roots) {
      const list = findParentList(node.id);
      if (!list) continue;
      if (diskWriteEnabled && node.fsParentHandle) {
        try { await node.fsParentHandle.removeEntry(node.name, { recursive: node.type === "folder" }); }
        catch (error) { failedCount++; showToast(`Não foi possível excluir “${node.name}” da pasta: ${error.message}`); continue; }
      }
      const removedIds = new Set(); collectSubtreeIds(node, removedIds);
      if (removedIds.has(activeId)) activeWasDeleted = true;
      list.splice(list.findIndex(item => item.id === node.id), 1);
      openTabs = openTabs.filter(id => !removedIds.has(id));
      removedIds.forEach(id => selectedIds.delete(id));
      deletedCount++;
    }
    if (activeWasDeleted) {
      activeId = null;
      if (editor) editor.setValue("");
      $("editorArea").hidden = true; $("welcome").hidden = false;
    }
    renderTabs(); renderTree(); updateSelectionControls();
    await saveProject(true);
    if (openTabs.length && !activeId) openFile(openTabs[openTabs.length - 1]);
    if (deletedCount) showToast(`${deletedCount} item(ns) excluído(s)${failedCount ? `; ${failedCount} falharam` : ""}.`);
    else if (!failedCount) showToast("Nenhum item foi excluído.");
  }
  async function createDiskEntry(parentId, type, name, content="") {
    if (!diskWriteEnabled || !rootDirHandle) return null;
    const parent = parentId ? findNode(parentId) : null;
    const parentHandle = parent ? parent.fsHandle : rootDirHandle;
    if (!parentHandle || typeof parentHandle.getFileHandle !== "function") return null;
    if (type === "folder") return await parentHandle.getDirectoryHandle(name, {create:true});
    const handle = await parentHandle.getFileHandle(name, {create:true});
    const writable = await handle.createWritable(); await writable.write(content); await writable.close();
    return handle;
  }
  async function requestWritePermission(handle=rootDirHandle) {
    if (!handle) return false;
    try {
      let permission = await handle.queryPermission({mode:"readwrite"});
      if (permission !== "granted") permission = await handle.requestPermission({mode:"readwrite"});
      diskWriteEnabled = permission === "granted";
      $("storageStatus").textContent = diskWriteEnabled ? "Pasta conectada — gravação direta ativa" : "Sem permissão de escrita — modo navegador";
      return diskWriteEnabled;
    } catch (error) {
      diskWriteEnabled = false;
      $("storageStatus").textContent = "Este navegador não liberou gravação direta";
      return false;
    }
  }
  function showToast(message) { const t=$("toast");t.textContent=message;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2600); }
  function safeName(name) { return name.trim().replace(/[\\/]/g,"").replace(/^\.+$/,""); }
  function hasSibling(list,name,excludeId=null) { return list.some(n=>n.id!==excludeId&&n.name.toLowerCase()===name.toLowerCase()); }
  function renderTree() {
    $("projectTitle").textContent=project.name;
    const root=$("tree");root.innerHTML="";
    visibleNodeIds = [];
    const filter=$("searchInput").value.trim().toLowerCase();
    const addNodes=(nodes,depth=0,trail="")=>{
      const sorted=[...nodes].sort((a,b)=>a.type===b.type?(a.name.localeCompare(b.name)):a.type==="folder"?-1:1);
      for(const n of sorted) {
        const full=trail?trail+"/"+n.name:n.name;
        const childMatches=n.type==="folder"&&hasMatchingChild(n,filter,full);
        if(filter && !n.name.toLowerCase().includes(filter) && !childMatches) continue;
        const row=document.createElement("div");row.className="tree-row"+(n.id===activeId?" active":"")+(selectedIds.has(n.id)?" selected":"");row.style.paddingLeft=(8+depth*15)+"px";row.setAttribute("role","treeitem");
        visibleNodeIds.push(n.id);
        const checkbox=document.createElement("input");checkbox.type="checkbox";checkbox.className="tree-select";checkbox.checked=selectedIds.has(n.id);checkbox.setAttribute("aria-label","Selecionar "+n.name);checkbox.title="Selecionar para exclusão";checkbox.onclick=e=>e.stopPropagation();checkbox.onchange=()=>{if(checkbox.checked)selectedIds.add(n.id);else selectedIds.delete(n.id);row.classList.toggle("selected",checkbox.checked);updateSelectionControls();};row.append(checkbox);
        const chev=document.createElement("span");chev.className="chevron";chev.textContent=n.type==="folder"?(collapsed.has(n.id)? "▸":"▾"):"";row.append(chev);
        const ico=document.createElement("span");ico.className="tree-icon";ico.textContent=iconFor(n);row.append(ico);
        const label=document.createElement("span");label.className="tree-name";label.textContent=n.name;label.title=full;row.append(label);
        const actions=document.createElement("span");actions.className="tree-actions";
        if(n.type==="folder"){const add=document.createElement("button");add.textContent="＋";add.title="Criar dentro da pasta";add.onclick=e=>{e.stopPropagation();openNameDialog("file",n.id);};actions.append(add);}
        const more=document.createElement("button");more.textContent="⋯";more.title="Ações";more.onclick=e=>{e.stopPropagation();showNodeMenu(n);};actions.append(more);row.append(actions);
        row.onclick=()=>{if(n.type==="folder"){collapsed.has(n.id)?collapsed.delete(n.id):collapsed.add(n.id);renderTree();}else openFile(n.id);};
        row.oncontextmenu=e=>{e.preventDefault();showNodeMenu(n);};
        let longPress;row.addEventListener("touchstart",()=>{longPress=setTimeout(()=>showNodeMenu(n),650);},{passive:true});["touchend","touchmove","touchcancel"].forEach(ev=>row.addEventListener(ev,()=>clearTimeout(longPress),{passive:true}));
        root.append(row);
        if(n.type==="folder"&&!collapsed.has(n.id))addNodes(n.children,depth+1,full);
      }
    };
    addNodes(project.nodes);
    if(!root.children.length){const p=document.createElement("div");p.className="empty-tab";p.textContent=filter?"Nenhum arquivo encontrado.":"Projeto vazio. Crie uma pasta ou arquivo.";root.append(p);}
    updateSelectionControls();
  }
  function hasMatchingChild(folder,filter,trail) {
    if(!filter)return false;
    return folder.children.some(n=>n.name.toLowerCase().includes(filter)||(n.type==="folder"&&hasMatchingChild(n,filter,trail+"/"+n.name)));
  }
  function renderTabs() {
    const el=$("tabs");el.innerHTML="";
    if(!openTabs.length){const d=document.createElement("div");d.className="empty-tab";d.textContent="Nenhum arquivo aberto";el.append(d);return;}
    openTabs.forEach(id=>{
      const n=findNode(id);if(!n)return;
      const tab=document.createElement("div");tab.className="tab"+(id===activeId?" active":"");tab.onclick=()=>openFile(id);
      const ic=document.createElement("span");ic.textContent=iconFor(n);const name=document.createElement("span");name.className="tab-name";name.textContent=n.name;
      const close=document.createElement("button");close.className="tab-close";close.textContent="×";close.setAttribute("aria-label","Fechar "+n.name);close.onclick=e=>{e.stopPropagation();closeTab(id);};
      tab.append(ic,name,close);el.append(tab);
    });
  }
  function setMode(name) { if(!editor)return;editor.setOption("mode",langFor(name));$("languageLabel").textContent=({htmlmixed:"HTML",css:"CSS",javascript:"JavaScript",markdown:"Markdown",null:"Texto simples"}[langFor(name)]||"Texto simples"); }
  function openFile(id) {
    const node=findNode(id);if(!node||node.type!=="file")return;
    if(editor&&activeId){const prev=findNode(activeId);if(prev&&prev.type==="file")prev.content=editor.getValue();if(dirty)saveProject(true,activeId);}
    if(!openTabs.includes(id))openTabs.push(id);
    activeId=id;$("welcome").hidden=true;$("editorArea").hidden=false;
    editor.setValue(node.content||"");setMode(node.name);editor.clearHistory();editor.focus();
    $("fileCrumb").textContent=project.name+"  /  "+pathOf(id);
    $("cursorLabel").textContent="Linha 1, Coluna 1";$("dirtyLabel").textContent="Salvo";
    renderTabs();renderTree();closeSidebarOnMobile();
  }
  function closeTab(id) {
    if(editor&&activeId===id){const n=findNode(id);if(n)n.content=editor.getValue();}
    openTabs=openTabs.filter(x=>x!==id);
    if(activeId===id){activeId=openTabs[openTabs.length-1]||null;if(activeId)openFile(activeId);else{$("editorArea").hidden=true;$("welcome").hidden=false;renderTabs();}}
    else renderTabs();
    saveProject(true);
  }
  function openNameDialog(mode,parentId=null,target=null) {
    dialogMode=mode;dialogParent=parentId;dialogTarget=target;
    const titles={file:"Novo arquivo",folder:"Nova pasta",rename:"Renomear",project:"Renomear projeto"};
    $("dialogTitle").textContent=titles[mode];$("nameLabel").textContent=mode==="project"?"Nome do projeto":"Nome";
    $("nameInput").value=mode==="rename"?target.name:mode==="project"?project.name:"";
    $("nameInput").placeholder=mode==="folder"?"ex.: components":"ex.: index.html";
    $("dialogHint").textContent=mode==="file"?"Use a extensão desejada, como .html, .css ou .js.":mode==="folder"?"A pasta pode conter arquivos e outras pastas.":"";
    $("confirmNameBtn").textContent=mode==="rename"||mode==="project"?"Salvar":"Criar";
    $("nameDialog").showModal();setTimeout(()=>$("nameInput").focus(),50);
  }
  $("nameForm").addEventListener("submit",async e=>{
    e.preventDefault();const name=safeName($("nameInput").value);if(!name){showToast("Digite um nome válido.");return;}
    if(dialogMode==="project"){project.name=name;renderTree();$("nameDialog").close();await saveProject(true);showToast("Projeto renomeado.");return;}
    let list=project.nodes;
    if(dialogMode==="rename"){list=findParentList(dialogTarget.id);if(!list)return;}
    else if(dialogParent){const p=findNode(dialogParent);if(!p||p.type!=="folder")return;list=p.children;}
    if(hasSibling(list,name,dialogMode==="rename"?dialogTarget.id:null)){showToast("Já existe um item com esse nome nesta pasta.");return;}
    if(dialogMode==="rename") {
      if (diskWriteEnabled && dialogTarget.fsHandle) {
        try {
          if (typeof dialogTarget.fsHandle.move === "function") {
            await dialogTarget.fsHandle.move(name);
          } else if (dialogTarget.type === "file") {
            const parentHandle = dialogTarget.fsParentHandle || rootDirHandle;
            const oldHandle = dialogTarget.fsHandle;
            const newHandle = await parentHandle.getFileHandle(name, {create:true});
            const oldFile = await oldHandle.getFile();
            const writable = await newHandle.createWritable(); await writable.write(await oldFile.arrayBuffer()); await writable.close();
            await parentHandle.removeEntry(dialogTarget.name);
            dialogTarget.fsHandle = newHandle;
          } else {
            showToast("Este navegador não permite renomear pastas diretamente. Use um navegador Chromium atualizado."); return;
          }
        } catch(error) { showToast("Não foi possível renomear no disco: " + error.message); return; }
      }
      dialogTarget.name=name;
    } else {
      let diskHandle = null;
      try { diskHandle = await createDiskEntry(dialogParent, dialogMode, name, ""); }
      catch(error) { showToast("Não foi possível criar no disco: " + error.message); return; }
      const newNode = dialogMode==="folder" ? {id:uid(),type:"folder",name,children:[],fsHandle:diskHandle,fsParentHandle:dialogParent?findNode(dialogParent)?.fsHandle:rootDirHandle} : {id:uid(),type:"file",name,content:"",fsHandle:diskHandle,fsParentHandle:dialogParent?findNode(dialogParent)?.fsHandle:rootDirHandle};
      list.push(newNode);
    }
    $("nameDialog").close();renderTree();await saveProject(true);showToast(dialogMode==="rename"?"Item renomeado.":"Criado: "+name);
    if(dialogMode==="file"){const n=list[list.length-1];openFile(n.id);}
  });
  async function showNodeMenu(node) {
    const choice=prompt(`Ações para "${node.name}"\\nDigite: r = renomear, d = excluir${node.type==="folder"?", n = nova pasta dentro dela":""}`);
    if(!choice)return;
    if(choice.toLowerCase()==="r")openNameDialog("rename",null,node);
    else if(choice.toLowerCase()==="d"){
      if(!confirm(`Excluir "${node.name}"${node.type==="folder"?" e todo o seu conteúdo":""}?`))return;
      const list=findParentList(node.id);if(list){
        if (diskWriteEnabled && node.fsParentHandle) {
          try { await node.fsParentHandle.removeEntry(node.name, {recursive:node.type==="folder"}); }
          catch(error) { showToast("Não foi possível excluir no disco: " + error.message); return; }
        }
        const removeIds=new Set();const collect=n=>{removeIds.add(n.id);if(n.type==="folder")n.children.forEach(collect);};collect(node);list.splice(list.findIndex(n=>n.id===node.id),1);openTabs=openTabs.filter(id=>!removeIds.has(id));removeIds.forEach(id=>selectedIds.delete(id));if(removeIds.has(activeId)){activeId=null;$("editorArea").hidden=true;$("welcome").hidden=false;}renderTabs();renderTree();saveProject(true);showToast("Item excluído.");}
    } else if(choice.toLowerCase()==="n"&&node.type==="folder")openNameDialog("folder",node.id);
  }
  function flattenNodes(nodes,base="") { const out=[];for(const n of nodes){const path=base?base+"/"+n.name:n.name;if(n.type==="folder"){out.push({path,isFolder:true});out.push(...flattenNodes(n.children,path));}else out.push({path,content:n.content||""});}return out; }
  async function exportZip() {
    if(!window.JSZip){showToast("A biblioteca ZIP não carregou. Verifique a conexão e tente novamente.");return;}
    await saveProject(true);
    const zip=new JSZip();flattenNodes(project.nodes).forEach(n=>{if(n.isFolder)zip.folder(n.path);else zip.file(n.path,n.content);});
    try{const blob=await zip.generateAsync({type:"blob"});downloadBlob(blob,(project.name||"projeto").replace(/[\\/:*?"<>|]/g,"_")+".zip");showToast("Projeto exportado como ZIP.");}
    catch(e){showToast("Erro ao criar ZIP: "+e.message);}
  }
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  async function importZipFile(file) {
    if(!window.JSZip){showToast("A biblioteca ZIP não carregou.");return;}
    rootDirHandle=null;diskWriteEnabled=false;
    try{
      const zip=await JSZip.loadAsync(file);const root={name:file.name.replace(/\.zip$/i,"")||"Projeto importado",nodes:[]};
      const ensureFolder=(parts)=>{let nodes=root.nodes,folder=null;for(const part of parts){folder=nodes.find(n=>n.type==="folder"&&n.name===part);if(!folder){folder={id:uid(),type:"folder",name:part,children:[]};nodes.push(folder);}nodes=folder.children;}return nodes;};
      const entries=Object.values(zip.files).filter(f=>!f.dir);
      for(const entry of entries){const parts=entry.name.split("/").filter(Boolean);if(!parts.length)continue;const name=parts.pop();const list=ensureFolder(parts);const content=await entry.async("string");const existing=list.find(n=>n.name===name);if(existing&&existing.type==="file")existing.content=content;else list.push({id:uid(),type:"file",name,content});}
      project=root;openTabs=[];activeId=null;selectedIds.clear();$("editorArea").hidden=true;$("welcome").hidden=false;renderTree();renderTabs();await saveProject(true);showToast(`Projeto importado: ${entries.length} arquivo(s).`);
    }catch(e){showToast("Não consegui abrir esse ZIP: "+e.message);}
  }
  async function importFolderFiles(files) {
    const list=[...files];if(!list.length)return;rootDirHandle=null;diskWriteEnabled=false;
    const rootName=(list[0].webkitRelativePath||list[0].name).split("/")[0]||"Projeto importado";
    const root={name:rootName,nodes:[]};
    for(const file of list){const rel=file.webkitRelativePath||file.name;const parts=rel.split("/").filter(Boolean);const name=parts.pop();let nodes=root.nodes;for(const part of parts){let f=nodes.find(n=>n.type==="folder"&&n.name===part);if(!f){f={id:uid(),type:"folder",name:part,children:[]};nodes.push(f);}nodes=f.children;}nodes.push({id:uid(),type:"file",name,content:await file.text()});}
    project=root;openTabs=[];activeId=null;selectedIds.clear();$("editorArea").hidden=true;$("welcome").hidden=false;renderTree();renderTabs();await saveProject(true);showToast(`Pasta importada: ${list.length} arquivo(s).`);
  }
  async function openRealFolder() {
    if(!("showDirectoryPicker" in window)){
      rootDirHandle=null;diskWriteEnabled=false;$("folderInput").click();
      showToast("Este navegador não oferece escrita direta por pasta. Será importada uma cópia.");return;
    }
    try{
      const handle=await window.showDirectoryPicker({mode:"readwrite"});
      rootDirHandle=handle;
      async function readDir(dirHandle,nodes,parentHandle){
        for await(const [name,h] of dirHandle.entries()){
          if(h.kind==="directory"){
            const folder={id:uid(),type:"folder",name,children:[],fsHandle:h,fsParentHandle:parentHandle};
            nodes.push(folder);await readDir(h,folder.children,dirHandle);
          } else {
            const file=await h.getFile();nodes.push({id:uid(),type:"file",name,content:await file.text(),fsHandle:h,fsParentHandle:parentHandle});
          }
        }
      }
      const root={name:handle.name,nodes:[]};await readDir(handle,root.nodes,handle);
      project=root;openTabs=[];activeId=null;selectedIds.clear();$("editorArea").hidden=true;$("welcome").hidden=false;
      await requestWritePermission(handle);renderTree();renderTabs();await saveProject(true);
      showToast(diskWriteEnabled ? "Pasta conectada! Alterações serão gravadas nos arquivos reais." : "Pasta aberta em modo de leitura; o navegador não concedeu escrita.");
    }catch(e){if(e.name!=="AbortError")showToast("Não foi possível abrir a pasta: "+e.message);}
  }
  function downloadCurrent() { const n=findNode(activeId);if(!n||n.type!=="file"){showToast("Abra um arquivo primeiro.");return;}if(editor)n.content=editor.getValue();downloadBlob(new Blob([n.content||""],{type:"text/plain;charset=utf-8"}),n.name); }
  function normalizeProjectPath(path) {
    const parts=[];
    for (const part of String(path||"").replace(/\\/g,"/").split("/")) {
      if (!part || part===".") continue;
      if (part==="..") parts.pop(); else parts.push(part);
    }
    return parts.join("/");
  }
  function findProjectFile(path) {
    const wanted=normalizeProjectPath(path);
    return flattenNodes(project.nodes).find(item=>!item.isFolder && normalizeProjectPath(item.path)===wanted);
  }
  function previewDocument(requestedPath=null, depth=0) {
    const files=flattenNodes(project.nodes).filter(item=>!item.isFolder);
    let entry=requestedPath ? findProjectFile(requestedPath) : ((activeId && /\.html?$/i.test(pathOf(activeId)) && findProjectFile(pathOf(activeId))) || findProjectFile("index.html") || files.find(item=>/\.html?$/i.test(item.path)));
    if(!entry) throw new Error("Não encontrei um arquivo HTML. Crie ou importe um index.html primeiro.");
    if(depth>8) return {html:"<p>Limite de páginas incorporadas atingido.</p>",path:entry.path};
    let html=entry.content||"";
    const entryDir=entry.path.includes("/")?entry.path.slice(0,entry.path.lastIndexOf("/")):"";
    const resolvePath=(src)=>normalizeProjectPath((entryDir?entryDir+"/":"")+String(src).split(/[?#]/)[0]);
    const localData=(mime,content)=>`data:${mime};charset=utf-8,${encodeURIComponent(content||"")}`;
    // Incorpora arquivos locais ao documento para simular os caminhos do projeto sem um servidor HTTP.
    html=html.replace(/<link\b([^>]*?)href\s*=\s*(["'])(.*?)\2([^>]*)>/gi,(whole,before,q,href,after)=>{
      if (/^(https?:|data:|\/\/|#|mailto:|javascript:)/i.test(href) || !/stylesheet/i.test(before+after)) return whole;
      const item=findProjectFile(resolvePath(href));
      return item ? `<style>\n/* ${href.replace(/[<>]/g,"")} */\n${item.content||""}\n</style>` : whole;
    });
    html=html.replace(/<script\b([^>]*?)src\s*=\s*(["'])(.*?)\2([^>]*)>\s*<\/script>/gi,(whole,before,q,src,after)=>{
      if (/^(https?:|data:|\/\/)/i.test(src)) return whole;
      const item=findProjectFile(resolvePath(src));
      return item ? `<script${before}${after}>\n${(item.content||"").replace(/<\/script/gi,"<\\/script")}\n<\/script>` : whole;
    });
    // Reescreve iframes para outras páginas HTML do próprio projeto, inclusive em subpastas.
    html=html.replace(/<iframe\b([^>]*?)src\s*=\s*(["'])(.*?)\2([^>]*)>/gi,(whole,before,q,src,after)=>{
      if (/^(https?:|data:|\/\/|about:|#)/i.test(src)) return whole;
      const childPath=resolvePath(src), child=findProjectFile(childPath);
      if(!child || !/\.html?$/i.test(child.path)) return whole;
      const childDoc=previewDocument(child.path,depth+1).html;
      return `<iframe${before}src="${localData("text/html",childDoc)}"${after}>`;
    });
    // Faz links para páginas HTML locais navegarem dentro da prévia em vez de saírem para caminhos inexistentes.
    html=html.replace(/\bhref\s*=\s*(["'])(.*?)\1/gi,(whole,q,href)=>{
      if (/^(https?:|data:|\/\/|#|mailto:|tel:|javascript:)/i.test(href)) return whole;
      const target=findProjectFile(resolvePath(href));
      if(target && /\.html?$/i.test(target.path)) return `href="${localData("text/html",previewDocument(target.path,depth+1).html)}"`;
      return whole;
    });
    return {html,path:entry.path};
  }
  function refreshPreview(showMessage=true) {
    if (!previewRunning) return;
    try {
      const result=previewDocument();
      const frame=$("previewFrame");
      frame.srcdoc=result.html;
      frame.hidden=false;
      $("previewEmpty").hidden=true;
      $("previewStatus").textContent=`Atualizada: ${result.path}`;
      if(showMessage) showToast("Prévia atualizada com o código mais recente.");
    } catch(error) {
      $("previewStatus").textContent="Não foi possível atualizar";
      $("previewFrame").hidden=true;
      $("previewEmpty").hidden=false;
      $("previewEmpty").querySelector("p").textContent=error.message;
      if(showMessage) showToast(error.message);
    }
  }
  function startPreview() {
    previewRunning=true;
    $("previewPanel").hidden=false;
    $("tabs").hidden=true;
    $("welcome").hidden=true;
    $("editorArea").hidden=true;
    $("previewBtn").setAttribute("aria-pressed","true");
    $("previewBtn").textContent="■ Fechar prévia";
    refreshPreview(false);
  }
  function stopPreview() {
    previewRunning=false;
    clearTimeout(previewUpdateTimer);
    $("previewFrame").srcdoc="";
    $("previewPanel").hidden=true;
    $("tabs").hidden=false;
    $("previewBtn").setAttribute("aria-pressed","false");
    $("previewBtn").textContent="▶ Prévia";
    if(activeId) $("editorArea").hidden=false; else $("welcome").hidden=false;
  }
  function schedulePreviewUpdate() {
    if(!previewRunning) return;
    clearTimeout(previewUpdateTimer);
    previewUpdateTimer=setTimeout(()=>refreshPreview(false),350);
  }
  function closeSidebarOnMobile(){if(innerWidth<=700){ $("sidebar").classList.remove("open");$("mobileOverlay").classList.remove("show");}}
  function toggleSidebar(){const open=$("sidebar").classList.toggle("open");$("mobileOverlay").classList.toggle("show",open);}
  async function init(){
    try{db=await openDB();project=await dbGet("main");}
    catch(e){showToast("Armazenamento local indisponível. Exporte seus projetos com frequência.");}
    if(!project)project=defaultProject();
    editor=CodeMirror.fromTextArea($("codeEditor"),{theme:"material-darker",lineNumbers:true,indentUnit:2,tabSize:2,indentWithTabs:false,mode:"htmlmixed",lineWrapping:false,viewportMargin:20,extraKeys:{"Tab":cm=>cm.replaceSelection("  ","end"),"Ctrl-S":()=>saveProject(),"Cmd-S":()=>saveProject()}});
    editor.on("change",()=>{if(activeId){const n=findNode(activeId);if(n)n.content=editor.getValue();scheduleSave();schedulePreviewUpdate();}});
    editor.on("cursorActivity",()=>{const c=editor.getCursor();$("cursorLabel").textContent=`Linha ${c.line+1}, Coluna ${c.ch+1}`;});
    renderTree();renderTabs();
    if(!await dbGetSafe("main"))await saveProject(true);
    if (!("showDirectoryPicker" in window)) $("storageStatus").textContent="Salvo neste navegador (sem acesso direto à pasta)";
  }
  async function dbGetSafe(key){try{return await dbGet(key);}catch{return null;}}
  $("newFileBtn").onclick=()=>openNameDialog("file");
  $("newFolderBtn").onclick=()=>openNameDialog("folder");
  $("welcomeFileBtn").onclick=()=>openNameDialog("file");
  $("welcomeImportBtn").onclick=()=> $("zipInput").click();
  $("projectMenuBtn").onclick=()=>openNameDialog("project");
  $("saveBtn").onclick=async()=>{await saveProject();if(previewRunning)refreshPreview(false);};
  $("previewBtn").onclick=()=>previewRunning?stopPreview():startPreview();
  $("refreshPreviewBtn").onclick=()=>refreshPreview(true);
  $("openPreviewTabBtn").onclick=()=>{if(!previewRunning)startPreview();try{const result=previewDocument();const blob=new Blob([result.html],{type:"text/html;charset=utf-8"});if(lastPreviewUrl)URL.revokeObjectURL(lastPreviewUrl);lastPreviewUrl=URL.createObjectURL(blob);window.open(lastPreviewUrl,"_blank","noopener");}catch(error){showToast(error.message);}};
  $("exportBtn").onclick=exportZip;
  $("downloadCurrentBtn").onclick=downloadCurrent;
  $("importZipBtn").onclick=()=>$("zipInput").click();
  $("importFolderBtn").onclick=openRealFolder;
  $("zipInput").onchange=async e=>{const f=e.target.files[0];if(f)await importZipFile(f);e.target.value="";};
  $("folderInput").onchange=async e=>{if(e.target.files.length)await importFolderFiles(e.target.files);e.target.value="";};
  $("searchInput").oninput=renderTree;
  $("selectVisibleBtn").onclick=()=>{
    const allSelected=visibleNodeIds.length>0&&visibleNodeIds.every(id=>selectedIds.has(id));
    visibleNodeIds.forEach(id=>allSelected?selectedIds.delete(id):selectedIds.add(id));
    renderTree();
  };
  $("deleteSelectedBtn").onclick=deleteSelectedNodes;
  $("menuBtn").onclick=toggleSidebar;
  $("mobileOverlay").onclick=closeSidebarOnMobile;
  window.addEventListener("beforeunload",e=>{if(dirty){e.preventDefault();e.returnValue="";}});
  init().then(()=>{
    window.setInterval(()=>{ if(dirty) saveProject(true); },60000);
  });
})();
