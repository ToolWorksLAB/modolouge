using System.Xml.Linq;
public static class PointTests
{
    public static void Run(Action<bool,string> check)
    {
        var point=XElement.Parse("<chunk><items><item name='GUID'>fbac3e32-f100-4292-8692-77240a42fd1a</item></items><chunks><chunk name='Container'><items><item name='SourceCount'>0</item></items><chunks><chunk name='PersistentData'><items><item name='Count'>1</item></items><chunks><chunk name='Branch'><items><item name='Count'>1</item><item name='Path'>{0}</item></items><chunks><chunk name='Item'><items><item name='Coordinate' type_code='51'><X>12.5</X><Y>-30</Y><Z>0</Z></item></items></chunk></chunks></chunk></chunks></chunk></chunks></chunk></chunks></chunk>");
        check(PointInputs.Read(point)!.SequenceEqual(new[]{12.5,-30,0}),"One embedded point exposes exact XYZ coordinates");
        void Reject(Action<XElement> change,string name) { var clone=new XElement(point);change(clone);check(PointInputs.Read(clone)==null,name); }
        Reject(x=>x.Descendants("item").Single(i=>(string?)i.Attribute("name")=="SourceCount").Value="1","Computed point is not exposed as a gumball");
        Reject(x=>x.Descendants("chunk").Single(i=>(string?)i.Attribute("name")=="Item").Element("items")!.Add(new XElement("item",new XAttribute("name","RefID"),Guid.NewGuid())),"Referenced point is not exposed");
        Reject(x=>x.Descendants("item").Single(i=>(string?)i.Attribute("name")=="Path").Value="{1;2}","Noncanonical point trees retain their original paths");
        Reject(x=>x.Descendants("X").Single().Value="NaN","Nonfinite coordinates rejected");
        Reject(x=>x.Descendants("X").Single().Value="1000001","Unbounded coordinates rejected");
        Reject(x=>x.Descendants("chunk").Single(i=>(string?)i.Attribute("name")=="Branch").Element("chunks")!.Add(new XElement("chunk",new XAttribute("name","Item"))),"Point lists are never flattened");
    }
}
