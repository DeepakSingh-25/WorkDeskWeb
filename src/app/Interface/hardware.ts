export interface Hardware {
    ID: string,
    ProductCode: string,
    ProductName: string,
    Price: string,
    GSTrate: string,
    SubTitle: string,
    Image1: string,
    Image2: string,
    Image3: string,
    ProductCategory: string,
    Description: string,
    AddEdit: string,
    ArrProductSpecification: [
        {
            Title: string,
            Specification: string
        }
    ]
}
