using System.Reflection;
using System.Text.Json;
using System.Xml.Linq;

// Native templates exported from the installed runtime, embedded at build time.
// The public edit API cannot supply XML, assembly names or script bodies.
public static class ComponentCatalog
{
    static readonly Lazy<Dictionary<string,string>> Templates = new(() => {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Modolouge.ComponentCatalog")
            ?? throw new Exception("Component catalog is missing from this worker build.");
        using var json = JsonDocument.Parse(stream);
        return json.RootElement.EnumerateArray().ToDictionary(x => x.GetProperty("id").GetString()!, x => x.GetProperty("xml").GetString()!, StringComparer.OrdinalIgnoreCase);
    });
    public static XElement Create(string componentId, string instanceId, int position)
    {
        if (!Guid.TryParseExact(instanceId, "D", out var id) || id == Guid.Empty)
            throw new Exception("Adding a component needs a fresh nonzero instance GUID.");
        if (!Templates.Value.TryGetValue(componentId, out var template))
            throw new Exception("Component is not in the installed creation catalog. Search the catalog first.");
        var obj = XElement.Parse(template);
        var c = obj.Element("chunks")!.Elements("chunk").Single(x => (string?)x.Attribute("name") == "Container");
        foreach (var item in c.Descendants("item").Where(x => (string?)x.Attribute("name") == "InstanceGuid"))
            item.Value = Guid.NewGuid().ToString();
        c.Element("items")!.Elements("item").Single(x => (string?)x.Attribute("name") == "InstanceGuid").Value = id.ToString();
        // Factory templates must be standalone, never copied with saved wires.
        if (c.Descendants("item").Any(x => (string?)x.Attribute("name") == "Source"))
            throw new Exception("Invalid connected catalog template.");
        foreach (var p in c.Descendants("item").Where(x => (string?)x.Attribute("name") is "Bounds" or "Pivot"))
        {
            if (p.Element("X") is {} x) x.Value = (200 + position % 5 * 240).ToString();
            if (p.Element("Y") is {} y) y.Value = (200 + position / 5 * 160).ToString();
        }
        return obj;
    }
}
