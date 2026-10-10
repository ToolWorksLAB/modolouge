using System.Xml.Linq;

// Drop overridden preview defaults while the archive is still inert XML.
// Never load RDK XML or follow material paths. Keep the original graph intact.
public static class PreviewMaterials
{
    const string Preview = "537b0419-bbc2-4ff4-bf08-afe526367b2c";
    const string Swatch = "9c53bac0-ba66-40bd-8154-ce9829b9db1a";
    public static string[] Normalize(XElement[] objects)
    {
        var unique = objects.Select(o => (obj: o, container: Chunk(o, "Container")))
            .Where(x => x.container != null)
            .GroupBy(x => Value(x.container!, "InstanceGuid"), StringComparer.OrdinalIgnoreCase)
            .Where(g => Guid.TryParse(g.Key, out _) && g.Count() == 1)
            .ToDictionary(g => g.Key, g => g.Single().obj, StringComparer.OrdinalIgnoreCase);
        var cleaned = 0;
        foreach (var obj in objects.Where(o => Value(o, "GUID").Equals(Preview, StringComparison.OrdinalIgnoreCase)))
        {
            var c = Chunk(obj, "Container");
            if (c == null) continue;
            var parameters = Chunk(c, "ParameterData") ?? c;
            var ports = parameters.Element("chunks")?.Elements("chunk")
                .Where(p => ((string?)p.Attribute("name") is "param_input" or "InputParam") && (string?)p.Attribute("index") == "1").ToArray() ?? [];
            if (ports.Length != 1) continue;
            var port = ports[0];
            var sources = port.Element("items")?.Elements("item").Where(i => (string?)i.Attribute("name") == "Source").ToArray() ?? [];
            // A declared count alone or a dangling/ambiguous wire is not evidence
            // that the saved fallback is overridden.
            if (sources.Length == 0 || Value(port, "SourceCount") != sources.Length.ToString() ||
                sources.Any(s => !unique.TryGetValue(s.Value, out var source) ||
                    !Value(source, "GUID").Equals(Swatch, StringComparison.OrdinalIgnoreCase) ||
                    Value(Chunk(source, "Container")!, "Locked").Equals("true", StringComparison.OrdinalIgnoreCase))) continue;
            foreach (var saved in port.Element("chunks")?.Elements("chunk")
                .Where(x => (string?)x.Attribute("name") == "PersistentData").ToArray() ?? [])
            {
                if (!saved.Descendants("item").Any(i => ((string?)i.Attribute("name"))?.StartsWith("rdk_", StringComparison.OrdinalIgnoreCase) == true)) continue;
                saved.Remove();
                port.Element("chunks")!.SetAttributeValue("count", port.Element("chunks")!.Elements().Count());
                cleaned++;
            }
        }
        return cleaned == 0 ? [] : [$"Ignored old saved material defaults in {cleaned} Custom Preview input(s); the connected Colour Swatches remain in use. Geometry and connections are unchanged."];
    }
    static XElement? Chunk(XElement e, string name) => e.Element("chunks")?.Elements("chunk").FirstOrDefault(x => (string?)x.Attribute("name") == name);
    static string Value(XElement e, string name) => e.Element("items")?.Elements("item").FirstOrDefault(x => (string?)x.Attribute("name") == name)?.Value ?? "";
}
