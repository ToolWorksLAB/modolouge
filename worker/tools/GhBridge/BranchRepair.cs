using System.Xml.Linq;

// Work only on inert archive metadata. Never instantiate unknown components.
public static class BranchRepair
{
    const string Preview = "537b0419-bbc2-4ff4-bf08-afe526367b2c";
    const string Group = "c552a431-af5b-46a9-a8a4-0fcbc27ef596";
    public static string[] Apply(XDocument xml, XElement objectList, HashSet<string> policy)
    {
        var objects = objectList.Elements("chunk").ToArray();
        if (objects.All(o => policy.Contains(Value(o, "GUID")))) return [];
        if (xml.Descendants("chunk").Count(c => (string?)c.Attribute("name") == "DefinitionObjects") != 1) return [];
        // GraphReader is deliberately forgiving for display; repairs must not be.
        var ids = objects.SelectMany(o => o.Descendants("item").Where(i => (string?)i.Attribute("name") == "InstanceGuid")).Select(i => i.Value).ToArray();
        if (ids.Any(id => !Guid.TryParse(id, out _)) || ids.Select(Guid.Parse).Distinct().Count() != ids.Length) return [];
        var graph = GraphReader.Read(objects);
        if (graph.notes.Length != 0 || graph.nodes.Length + graph.groups.Length != objects.Length) return [];
        var sources = objects.SelectMany(o => o.Descendants("item").Where(i => (string?)i.Attribute("name") == "Source")).ToArray();
        if (sources.Length != graph.wires.Length) return [];
        foreach (var items in objects.SelectMany(o => o.Descendants("items")))
        {
            var count = items.Elements("item").FirstOrDefault(i => (string?)i.Attribute("name") == "SourceCount");
            var actual = items.Elements("item").Count(i => (string?)i.Attribute("name") == "Source");
            if ((count != null || actual > 0) && (!int.TryParse(count?.Value, out var n) || n != actual)) return [];
        }
        var byId = objects.ToDictionary(o => Value(Container(o), "InstanceGuid"), StringComparer.OrdinalIgnoreCase);
        if (graph.groups.Any(g => !Value(byId[g.id], "GUID").Equals(Group, StringComparison.OrdinalIgnoreCase))) return [];
        var roots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var explicitOutputs = false;
        foreach (var o in objects)
        {
            var c = Container(o);
            if (Value(o, "Name").Contains("Context Bake", StringComparison.OrdinalIgnoreCase)) return [];
            if (!Value(o, "GUID").Equals(Group, StringComparison.OrdinalIgnoreCase)) continue;
            var label = Value(c, "NickName");
            if (!label.Contains("RH_OUT") && !label.Contains("RH_IN")) continue;
            var members = c?.Element("items")?.Elements("item").Where(i => (string?)i.Attribute("name") == "ID").Select(i => i.Value).ToArray() ?? [];
            if (members.Length == 0 || members.Any(id => !byId.ContainsKey(id))) return [];
            roots.UnionWith(members);
            if (label.Contains("RH_OUT")) explicitOutputs = true;
        }
        if (!explicitOutputs)
        {
            var previews = graph.nodes.Where(n => n.componentId.Equals(Preview, StringComparison.OrdinalIgnoreCase) && !n.locked).ToArray();
            if (previews.Length == 0) return [];
            var chosen = previews.Any(n => !n.hidden) ? previews.Where(n => !n.hidden).ToArray() : previews;
            if (chosen.Any(n => n.inputs.Length == 0 || !graph.wires.Any(w => w.targetPort == n.inputs[0].id))) return [];
            roots.UnionWith(chosen.Select(n => n.id));
        }
        var keep = new HashSet<string>(roots, StringComparer.OrdinalIgnoreCase);
        var pending = new Stack<string>(roots);
        while (pending.TryPop(out var id))
            foreach (var wire in graph.wires.Where(w => w.targetNode.Equals(id, StringComparison.OrdinalIgnoreCase)))
                if (keep.Add(wire.sourceNode)) pending.Push(wire.sourceNode);
        // Never substitute, bypass or remove a required component.
        if (keep.Any(id => !byId.TryGetValue(id, out var o) || !policy.Contains(Value(o, "GUID")))) return [];
        var removed = objects.Where(o => !Value(o, "GUID").Equals(Group, StringComparison.OrdinalIgnoreCase) && !keep.Contains(Value(Container(o), "InstanceGuid"))).ToArray();
        if (removed.Length == 0) return [];
        var removedIds = removed.Select(o => Value(Container(o), "InstanceGuid")).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var o in removed) o.Remove();
        foreach (var o in objectList.Elements("chunk").Where(o => Value(o, "GUID").Equals(Group, StringComparison.OrdinalIgnoreCase)).ToArray())
        {
            var items = Container(o)?.Element("items");
            if (items == null) continue;
            foreach (var item in items.Elements("item").Where(i => (string?)i.Attribute("name") == "ID" && removedIds.Contains(i.Value)).ToArray()) item.Remove();
            var members = items.Elements("item").Where(i => (string?)i.Attribute("name") == "ID").ToArray();
            if (members.Length == 0) { o.Remove(); continue; }
            for (var i = 0; i < members.Length; i++) members[i].SetAttributeValue("index", i);
            var count = items.Elements("item").FirstOrDefault(i => (string?)i.Attribute("name") == "ID_Count");
            if (count != null) count.Value = members.Length.ToString();
        }
        var retained = objectList.Elements("chunk").ToArray();
        for (var i = 0; i < retained.Length; i++) retained[i].SetAttributeValue("index", i);
        var objectCount = objectList.Parent?.Element("items")?.Elements("item").FirstOrDefault(i => (string?)i.Attribute("name") == "ObjectCount");
        if (objectCount != null) objectCount.Value = retained.Length.ToString();
        foreach (var list in xml.Descendants().Where(e => e.Name == "items" || e.Name == "chunks")) list.SetAttributeValue("count", list.Elements().Count());
        var summary = string.Join(", ", removed.GroupBy(o => Value(o, "Name")).Select(g => $"{g.Key} ({g.Count()})"));
        return [$"Automatic geometry-only repair removed {removed.Length} objects outside the selected outputs: {summary}. Annotations, styling and other unused branches may be omitted. All dependencies of the selected outputs are preserved; the uploaded original is unchanged."];
    }
    static XElement? Container(XElement o) => o.Element("chunks")?.Elements("chunk").FirstOrDefault(c => (string?)c.Attribute("name") == "Container");
    static string Value(XElement? e, string name) => e?.Element("items")?.Elements("item").FirstOrDefault(i => (string?)i.Attribute("name") == name)?.Value ?? "";
}
