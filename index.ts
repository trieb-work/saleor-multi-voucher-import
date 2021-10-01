import { ApolloClient, gql, HttpLink, InMemoryCache } from "@apollo/client";
import fetch from "isomorphic-fetch"
import csv from "csvtojson";

require('dotenv').config()

/**
 * Create a .env file with SALEOR_URL and SALEOR_TOKEN
 * If you want to add certain collection or categories IDs, do that here:
 * 
 */

const collectionIds = ["Q29sbGVjdGlvbjo3","Q29sbGVjdGlvbjoy"]
const endDate = new Date("2021-12-31").toISOString()

const getVoucher = gql`
    query VoucherList($voucher:String) {
    vouchers(filter: { search: $voucher }, first: 1) {
        edges {
        node {
            id
            code
        }
        }
    }
    }
`
const createVoucher = gql`
    mutation voucherCreate($code: String, $type: VoucherTypeEnum, $endDate: DateTime) {
        voucherCreate(
            input: {
                type: $type
                code: $code
                applyOncePerCustomer: true
                applyOncePerOrder: false
                usageLimit: 1
                discountValueType: PERCENTAGE,
                endDate: $endDate
            }
        ) {
            voucher {
            id
            name
            }
            discountErrors {
            field
            message
            }
        }
        }
`;
const channelListingUpdate = gql`
    mutation VoucherChannelListingUpdate($id: ID!, $channelId: ID!) {
    voucherChannelListingUpdate(
        id: $id
        input: { addChannels: { channelId: $channelId, discountValue: 15 } }
    ) {
        discountErrors {
        message
        field
        }
    }
    }
`;
const VoucherCatalougesAdd = gql`
    mutation VoucherCataloguesAdd($id: ID!, $input: CatalogueInput!) {
        voucherCataloguesAdd(id: $id, input: $input){discountErrors{field message}}
    }
`;



const main = async () => {
    const data = await csv().fromFile('./ticket-sprinter-codes.csv')
    
    const saleorClient = new ApolloClient({
        link: new HttpLink({
            fetch,
            uri: process.env.SALEOR_URL,
            headers: {
                authorization: process.env.SALEOR_TOKEN
            }
        }),
        cache: new InMemoryCache()
    })

    const validForSpecificProductsOnly = (collectionIds.length > 0)
    if (validForSpecificProductsOnly) console.log('These vouchers are valid for specific product groups only')

    for (const voucher of data) {

        if (!voucher.code) {
            console.log('Voucher code undefined!')
            return true;
        }
        console.log(`Checking if voucher ${voucher.code} does already exist..`)
        try {
            const doesExist = await saleorClient.query({
                query: getVoucher,
                variables: {
                    voucher: voucher.code
                } 
            })
            if (doesExist.data.vouchers.edges.length === 0) {
                console.log('Creating voucher..')
                const creationResult = await saleorClient.mutate({
                    mutation: createVoucher,
                    variables: {
                        code: voucher.code,
                        type: validForSpecificProductsOnly ? "SPECIFIC_PRODUCT" : "ENTIRE_ORDER",
                        endDate: endDate || undefined
                    }
                })
                const voucherId = creationResult.data.voucherCreate.voucher.id
                console.log(`Created voucher with id ${voucherId}`)

                const channelListing = await saleorClient.mutate({
                    mutation: channelListingUpdate,
                    variables: {
                        id: voucherId,
                        channelId: "Q2hhbm5lbDox"
                    }
                })

                if (collectionIds.length > 0) {
                    console.log('Adding a specific catalouge to this voucher')
                    const catalougesAdd = await saleorClient.mutate({
                        mutation: VoucherCatalougesAdd,
                        variables: {
                            id: voucherId,
                            input: {
                                collections: collectionIds
                            }
                        }
                    })
                    
                }

            }
            
        } catch (error) {
            if (error instanceof Error){
                console.error(JSON.stringify(error))
            }

            throw error;
            
        }

    }

};
main();