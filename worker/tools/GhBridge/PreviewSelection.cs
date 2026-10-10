public static class PreviewSelection
{
    const string CustomPreview = "537b0419-bbc2-4ff4-bf08-afe526367b2c";
    public static HashSet<string> Sources(GraphReader.Graph graph, out bool hiddenFallback)
    {
        var previews = graph.nodes.Where(n => n.componentId.Equals(CustomPreview, StringComparison.OrdinalIgnoreCase) && !n.locked).ToArray();
        var visible = previews.Where(n => !n.hidden).ToArray();
        hiddenFallback = visible.Length == 0 && previews.Length > 0;
        var chosen = visible.Length > 0 ? visible : previews;
        // The first Custom Preview input is geometry. The second is material;
        // adding the display component itself as a Compute output yields nothing.
        var geometryPorts = chosen.Where(n => n.inputs.Length > 0).Select(n => n.inputs[0].id).ToHashSet();
        return graph.wires.Where(w => geometryPorts.Contains(w.targetPort)).Select(w => w.sourceNode).ToHashSet();
    }
}
