const { Plugin } = require("obsidian");

// "children"    -> conta só os filhos diretos (links de saída da nota-pai)
// "descendants" -> conta todos os descendentes alcançáveis (com proteção contra ciclos)
const MODE = "children";

// Multiplicador para deixar a diferença entre pais e folhas mais visível
const SCALE = 1.5;

module.exports = class GraphTreeSize extends Plugin {
  async onload() {
    this.apply = this.debounce(() => this.applyAll(), 300);

    this.registerEvent(this.app.metadataCache.on("resolved", this.apply));
    this.registerEvent(this.app.workspace.on("layout-change", this.apply));
    this.registerEvent(this.app.workspace.on("active-leaf-change", this.apply));

    // Reaplica periodicamente: o grafo reconstrói os pesos ao filtrar/recarregar
    this.registerInterval(window.setInterval(() => this.applyAll(), 1500));

    this.app.workspace.onLayoutReady(() => this.applyAll());
  }

  debounce(fn, ms) {
    let t;
    return () => {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  // Mapa nota -> lista de filhos (links de saída)
  buildChildren() {
    const resolved = this.app.metadataCache.resolvedLinks;
    const children = new Map();
    for (const src of Object.keys(resolved)) {
      children.set(
        src,
        Object.keys(resolved[src]).filter((dst) => dst !== src)
      );
    }
    return children;
  }

  countDescendants(id, children) {
    const seen = new Set([id]);
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      for (const next of children.get(cur) || []) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    return seen.size - 1;
  }

  applyAll() {
    const leaves = [
      ...this.app.workspace.getLeavesOfType("graph"),
      ...this.app.workspace.getLeavesOfType("localgraph"),
    ];
    if (!leaves.length) return;

    const children = this.buildChildren();

    for (const leaf of leaves) {
      const renderer = leaf.view && leaf.view.renderer;
      if (!renderer || !Array.isArray(renderer.nodes)) continue;

      let changed = false;
      for (const node of renderer.nodes) {
        if (!children.has(node.id)) {
          // Folhas, tags, anexos, nós fantasma: peso mínimo
          if (node.weight !== 0) {
            node.weight = 0;
            changed = true;
          }
          continue;
        }
        const count =
          MODE === "descendants"
            ? this.countDescendants(node.id, children)
            : children.get(node.id).length;
        const weight = count * SCALE;
        if (node.weight !== weight) {
          node.weight = weight;
          changed = true;
        }
      }
      if (changed && typeof renderer.changed === "function") renderer.changed();
    }
  }

  onunload() {
    // Ao desativar, o Obsidian recalcula os pesos originais ao recarregar o grafo
    const leaves = [
      ...this.app.workspace.getLeavesOfType("graph"),
      ...this.app.workspace.getLeavesOfType("localgraph"),
    ];
    for (const leaf of leaves) {
      const r = leaf.view && leaf.view.renderer;
      if (r && typeof r.changed === "function") r.changed();
    }
  }
};
