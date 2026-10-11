using System.Globalization;
using System.Xml.Linq;

// Only a single, embedded, unwired Point parameter is an editable position.
// Collections, referenced Rhino geometry and computed points are not flattened.
public static class PointInputs
{
    public static double[]? Read(XElement obj)
    {
        string Value(XElement e, string n) => e.Element("items")?.Elements("item").FirstOrDefault(i => (string?)i.Attribute("name") == n)?.Value ?? "";
        if (Value(obj,"GUID") != "fbac3e32-f100-4292-8692-77240a42fd1a") return null;
        var c=obj.Element("chunks")?.Elements("chunk").SingleOrDefault(x => (string?)x.Attribute("name")=="Container");
        if (c == null || Value(c,"SourceCount") != "0" || c.Element("items")!.Elements("item").Any(i => (string?)i.Attribute("name")=="Source")) return null;
        var data=c.Element("chunks")?.Elements("chunk").SingleOrDefault(x => (string?)x.Attribute("name")=="PersistentData");
        if (data == null || Value(data,"Count") != "1") return null;
        var branches=data.Element("chunks")?.Elements("chunk").ToArray() ?? [];
        if (branches.Length != 1 || Value(branches[0],"Count") != "1" || Value(branches[0],"Path") != "{0}") return null;
        var entries=branches[0].Element("chunks")?.Elements("chunk").ToArray() ?? [];
        if (entries.Length != 1) return null;
        var fields=entries[0].Element("items")?.Elements("item").ToArray() ?? [];
        if (fields.Length != 1 || (string?)fields[0].Attribute("name") != "Coordinate" || (string?)fields[0].Attribute("type_code") != "51") return null;
        var point=new double[3];
        for(var i=0;i<3;i++)
            if(!double.TryParse(fields[0].Element(new[]{"X","Y","Z"}[i])?.Value,NumberStyles.Float,CultureInfo.InvariantCulture,out point[i]) || !double.IsFinite(point[i]) || Math.Abs(point[i])>1e6) return null;
        return point;
    }
}
