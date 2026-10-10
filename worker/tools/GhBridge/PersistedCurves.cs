using System.Globalization;
using System.Xml.Linq;

// GH_Structure<IGH_Goo>.Read selects a type from the saved TypeName. Accept
// only the exact built-in curve reader and its closed, embedded-data format.
// Do not allow ObjectWrapper, assembly-qualified names or plugin goo.
public static class PersistedCurves
{
    public static bool IsAllowed(XElement data)
    {
        if (!SectionsAreUnique(data)) return false;
        var branches = Children(data);
        if (!CountMatches(data, branches.Length) || branches.Length > 20000 || branches.Length == 0) return false;
        var total = 0;
        for (var i = 0; i < branches.Length; i++)
        {
            var branch = branches[i];
            if (!SectionsAreUnique(branch)) return false;
            var values = Children(branch);
            if (!Named(branch, "Branch", i) || !CountMatches(branch, values.Length) || (total += values.Length) > 20000) return false;
            for (var j = 0; j < values.Length; j++)
            {
                var value = values[j];
                if (!SectionsAreUnique(value)) return false;
                if (!Named(value, "Item", j) || Children(value).Length != 0) return false;
                var fields = value.Element("items")?.Elements("item").ToArray() ?? [];
                var expected = new Dictionary<string, string> { ["TypeName"] = "10", ["RefID"] = "9", ["EdgeIndex"] = "3", ["ON_Version"] = "3", ["ON_Data"] = "20" };
                if (fields.Length != expected.Count || fields.Select(x => (string?)x.Attribute("name")).Distinct().Count() != fields.Length ||
                    fields.Any(x => !expected.TryGetValue((string?)x.Attribute("name") ?? "", out var code) || (string?)x.Attribute("type_code") != code)) return false;
                if (Value(value, "TypeName") != "Grasshopper.Kernel.Types.GH_Curve" ||
                    !Guid.TryParse(Value(value, "RefID"), out var reference) || reference != Guid.Empty ||
                    Value(value, "EdgeIndex") != "-1" ||
                    !int.TryParse(Value(value, "ON_Version"), out var version) || version < 1 || version > 80) return false;
                var bytes = fields.Single(x => (string?)x.Attribute("name") == "ON_Data");
                if (bytes.Elements().Count() != 1 || bytes.Element("stream") is not { } stream || string.IsNullOrWhiteSpace(stream.Value)) return false;
            }
        }
        return total > 0;
    }
    static bool Named(XElement e, string name, int index) => (string?)e.Attribute("name") == name && (string?)e.Attribute("index") == index.ToString(CultureInfo.InvariantCulture);
    static bool SectionsAreUnique(XElement e) => e.Elements("items").Count() == 1 && e.Elements("chunks").Count() <= 1 &&
        e.Elements().All(x => x.Name == "items" || x.Name == "chunks") &&
        e.Element("items")!.Elements().All(x => x.Name == "item") &&
        (e.Element("chunks")?.Elements().All(x => x.Name == "chunk") ?? true);
    static XElement[] Children(XElement e) => e.Element("chunks")?.Elements("chunk").ToArray() ?? [];
    static string Value(XElement e, string name) => e.Element("items")?.Elements("item").FirstOrDefault(x => (string?)x.Attribute("name") == name)?.Value ?? "";
    static bool CountMatches(XElement e, int count)
    {
        var fields = e.Element("items")?.Elements("item").Where(x => (string?)x.Attribute("name") == "Count").ToArray() ?? [];
        return fields.Length == 1 && int.TryParse(fields[0].Value, out var declared) && declared == count;
    }
}
