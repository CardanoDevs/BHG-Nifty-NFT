import { useEffect, useState } from "react";
import {
  // burnPack,
  connectWallet,
  getCurrentWalletConnected,
  getMetaList,
  // mintNFT,
  upload,
} from "./util/interact.js";
import { chainId } from "./constants/address";
import { pinJSONToIPFS, removePinFromIPFS } from "./util/pinata.js";
import { ethers } from "ethers";
import itemsMeta from "./constants/items-meta.json";
import { contractAddress } from "./constants/address";
import Token from "./components/token";
import { Image } from "theme-ui";
import GOLD from "./asset/GOLD.gif";
import LOGO from "./asset/nifty-logo.svg";
const Minter = (props) => {
  const [walletAddress, setWallet] = useState("");
  const [status, setStatus] = useState("");

  const [mintLoading, setMintLoading] = useState(false);

  const [metaData, setMetaData] = useState([]);
  const [newMint, setNewMint] = useState([]);

  useEffect(async () => {
    const { address, status } = await getCurrentWalletConnected();

    setWallet(address);
    setStatus(status);

    addWalletListener();
  }, []);

  useEffect(async () => {
    if (!!walletAddress) {
      let meta = await getMetaList(walletAddress);
      // console.log('meta', meta, metaData)
      setMetaData(meta);
    }
    console.log(walletAddress);
  }, [walletAddress]);

  useEffect(async () => {
    console.log(newMint, newMint.length);
    if (newMint.length) {
      let newMeta = await getMetaList(walletAddress, newMint);
      console.log("newMeta", newMeta);
      setMetaData(metaData.concat(newMeta));
    }
  }, [newMint]);

  function addWalletListener() {
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", (accounts) => {
        if (accounts.length > 0) {
          setWallet(accounts[0]);
          setStatus("👆🏽 You can mint new pack now.");
        } else {
          setWallet("");
          setStatus("🦊 Connect to Metamask using the top right button.");
        }
      });
      window.ethereum.on("chainChanged", (chain) => {
        connectWalletPressed();
        if (chain !== chainId) {
        }
      });
    } else {
      setStatus(
        <p>
          {" "}
          🦊{" "}
          {/* <a target="_blank" href={`https://metamask.io/download.html`}> */}
          You must install Metamask, a virtual Ethereum wallet, in your
          browser.(https://metamask.io/download.html)
          {/* </a> */}
        </p>
      );
    }
  }

  const connectWalletPressed = async () => {
    const walletResponse = await connectWallet();
    setStatus(walletResponse.status);
    setWallet(walletResponse.address);
  };

  const onMintPressed = async () => {
    setMintLoading(true);

    const infuraProvider = new ethers.providers.InfuraProvider("ropsten");
    const contractABI = require("./contract-abi.json");
    const contract = new ethers.Contract(
      contractAddress,
      contractABI,
      infuraProvider
    );

    let clanNumber = Math.floor(Math.random() * itemsMeta.count.set);
    const metaData = itemsMeta.set[clanNumber];
    metaData.name = metaData.name + Date.now(); // name+timestamp
    const pinataResponseClan = await pinJSONToIPFS(metaData);
    console.log(pinataResponseClan);
    if (!pinataResponseClan.success) {
      setStatus("😢 Something went wrong while uploading your tokenURI.");
      setMintLoading(false);
      return;
    }
    const tokenURI = pinataResponseClan.pinataUrl;

    let ABI = ["function mintPack(string memory tokenURI)"];
    let iface = new ethers.utils.Interface(ABI);
    let dataParam = iface.encodeFunctionData("mintPack", [tokenURI]);

    const transactionParameters = {
      to: contractAddress, // Required except during contract publications.
      from: walletAddress, // must match user's active address.
      data: dataParam,
    };

    try {
      window.ethereum
        .request({
          method: "eth_sendTransaction",
          params: [transactionParameters],
        })
        .then(async (data) => {
          console.log("pack pending--hash", data);

          contract.on("MintPack(address,uint256)", async (to, newId) => {
            setMintLoading(false);
            if (to === ethers.utils.getAddress(walletAddress)) {
              let tokenId = ethers.BigNumber.from(newId).toNumber();
              console.log("newId", tokenId);
              setNewMint([tokenId]);
            }
          });
        })
        .catch(async (error) => {
          console.log(error);
          await removePinFromIPFS(tokenURI);
          setMintLoading(false);
        });
    } catch (error) {
      setStatus("😥 Something went wrong: " + error.message);
      setMintLoading(false);
    }
  };

  const onBurnPressed = async (tokenId, packType) => {
    setStatus("");
    console.log(tokenId, packType);

    // get cardlist minted on chain
    const infuraProvider = new ethers.providers.InfuraProvider("ropsten");
    const contractABI = require("./contract-abi.json");
    const contract = new ethers.Contract(
      contractAddress,
      contractABI,
      infuraProvider
    );
    const cardIndexes = [];
    const cardURIs = [];
    console.log(packType, !!packType);
    if (!!packType) {
      const totalCardList = [];
      try {
        totalCardList = await contract._getCardList();
      } catch (error) {
        console.log("network error--", error);
      }
      const clanCardList = [];
      for (let i = 0; i < totalCardList.length; i++) {
        let temp =
          ethers.BigNumber.from(totalCardList[i]).toNumber() -
          itemsMeta.cardsum[packType];
        if (temp >= 0 && temp < 10000) {
          clanCardList.push(temp);
        }
      }
      console.log("minted already--", totalCardList, clanCardList);

      console.log(
        ethers.BigNumber.from(
          Math.floor(Math.random() * itemsMeta.count.card[packType])
        )
      );
      // get card metadata
      for (;;) {
        if (
          (itemsMeta.count.card[packType] - clanCardList.length > 6 &&
            cardIndexes.length === 6) ||
          itemsMeta.count.card[packType] - clanCardList.length ===
            cardIndexes.length
        ) {
          break;
        }

        let cardNumber = Math.floor(
          Math.random() * itemsMeta.count.card[packType]
        );
        if (
          clanCardList.includes(cardNumber + itemsMeta.cardsum[packType]) ||
          cardIndexes.includes(cardNumber + itemsMeta.cardsum[packType])
        ) {
          continue;
        }
        const metaData = {};
        metaData.name = packType + cardNumber + "-" + Date.now(); // name+timestamp
        metaData.description = packType + " Card";
        metaData.image =
          "https://ipfs.io/ipfs/" + itemsMeta.card[packType][cardNumber];
        metaData.attributes = [
          {
            trait_type: "Collection",
            value: "Card",
          },
          {
            trait_type: "Collection Name",
            value: "Promo",
          },
        ];
        cardIndexes.push(cardNumber + itemsMeta.cardsum[packType]);

        // pin metadata to pinata
        const pinataResponseClan = await pinJSONToIPFS(metaData);
        console.log(pinataResponseClan);
        if (!pinataResponseClan.success) {
          console.log("😢 Something went wrong while uploading your tokenURI.");
        } else {
          cardURIs.push(pinataResponseClan.pinataUrl);
        }
      }
    }
    console.log("cardIndexes, cardURIs", cardIndexes, cardURIs);
    let ABI = [
      "function burn(uint256 tokenId, uint256[] memory cardIndexes, string[] memory cardURIs)",
    ];
    let iface = new ethers.utils.Interface(ABI);
    let dataParam = iface.encodeFunctionData("burn", [
      tokenId,
      cardIndexes,
      cardURIs,
    ]);

    const transactionParameters = {
      to: contractAddress, // Required except during contract publications.
      from: walletAddress, // must match user's active address.
      data: dataParam,
    };

    try {
      const txHash = window.ethereum
        .request({
          method: "eth_sendTransaction",
          params: [transactionParameters],
        })
        .then(async (data) => {
          console.log("pack burnt--hash", data);
          contract.on(
            "NftBurnt(address, string, uint256[6])",
            async (from, tokenUri, bigNumIds) => {
              console.log(from, tokenUri, bigNumIds);
              if (
                from ===
                ethers.utils.getAddress(window.ethereum.selectedAddress)
              ) {
                let newIds = [];
                for (let i = 0; i < bigNumIds.length; i++) {
                  let id = ethers.BigNumber.from(bigNumIds[i]).toNumber();
                  if (id !== 1) {
                    newIds.push(id);
                  }
                }
                console.log(newIds, tokenUri);
                setNewMint(newIds);
                await removePinFromIPFS(tokenUri);
              }
            }
          );
        })
        .catch(async (error) => {
          console.log(error);
          for (let i = 0; i < cardURIs.length; i++) {
            await removePinFromIPFS(cardURIs[i]);
          }
        });

      setStatus("✅ Check out your transaction on Etherscan.");
    } catch (error) {
      setStatus("😥 Something went wrong: " + error.message);
    }
  };

  const onMetaPressed = async () => {
    setStatus("");
    let meta = await getMetaList(walletAddress);
    setMetaData(meta);
    console.log("meta", meta);
  };
  const onUploadPressed = () => {
    setStatus("");
    upload();
  };

  return (
    <div className="Minter">
      <button id="walletButton" onClick={connectWalletPressed}>
        {walletAddress.length > 0 ? (
          "Connected: " +
          String(walletAddress).substring(0, 6) +
          "..." +
          String(walletAddress).substring(38)
        ) : (
          <span>Connect Wallet</span>
        )}
      </button>

      <br></br>
      <Image
        sx={{ width: "30%", bg: "white", borderBottom: "1px solid black" }}
        // src={`https://${data.meta.image}`}
        src={LOGO}
      />
      <h2>Abstract</h2>
      <p>
        A community led project focused on specific categories of NFTs would
        accelerate the use cases for digital assets, attracting more users into
        the ecosystem and establishing long-term value for the entire digital
        economy. The NFT community is highly collaborative in terms of helping
        artists, musicians, collectors and technologists. A coordinated effort
        among this community will be powerful, and would add lasting value to a
        much larger community{" "}
      </p>
      <h2>Solution</h2>
      <p>
        Nifty aims to advance these 5 categories within the NFT space and
        identify future projects to support, council, and bring to market. This
        is all guided by experts within the community. Nifty is a community
        project where early supporters receive maximum value. This is the only
        project where your efforts can build value for each token holder while
        also inventing the future landscape of NFTs, DAOs, and DeFi. Nifty is
        also the first project that combines rarities through properties into an
        NFT that serves as a minting pass and utility token. Categorized
        properties of NFTs coordinate the efforts of the community members. The
        utility of the NFT allows access to future mints. The sale of
        collectible NFTs establishes a community-governed DAO to use funds for
        developing projects and acquiring assets to further the objectives of
        the DAO.
      </p>
      <h2>Why Nifty</h2>
      <p>
        The NFT community is in the infancy stages of development, and the
        market has launched under the primary workings of artists. There are
        virtually no limits to what we can accomplish using the viable tools of
        non-fungible tokens, decentralized finance, digital assets and
        decentralized autonomous organizations. Our purpose is to further
        develop the innovation pipeline that exists today, and create additional
        community value that extends decades beyond where we are today. We have
        categorized this project into 5 community led categories: Gaming,
        Intellectual Property (IP) Collections, Artists & Artisans, Audio, and
        the Business Suite.
      </p>
      <h2>FAQ</h2>
      <h3>How can i buy my first Nifty? </h3>
      <p>
        First install a metamask extension. Load some ether into your wallet.
        Finally click “MINT” and approve the transaction through metamask!{" "}
      </p>
      <h3>How to burn my Nifty? </h3>
      <p>
        Once you have minted a pack you can head over to the “Open pack” tab.
        Here you have the option to select which of your packs you would like to
        burn. Once chosen your selected packs will be burned.
      </p>
      <h3>Nifty.io Glossary </h3>
      <p>
        NiftyQuest - Our ongoing tasks towards our mission of inventing the
        future together and advancing humanity through NFTs, DAOs, and DeFi.
        NiftyJewel - The utility token used throughout the NiftyQuest. Knight/s
        - Owners of NiftyJewels with an active role in the community. Legacy
        Knight/s - Owners of Legacy Gems. Leaders assigned to a community
        category mission. Legacy Gem - Legacy Gems are 1:1 NiftyJewels that
        represent a category and are wielded by the Legacy Knights. Round Table
        - Leadership Board including Nifty.io Founders and the Legacy Nights.
      </p>
      <h3>Can i trade my Nifty? </h3>
      <p>
        Yes once minted you can buy and sell your packs on a secondary market
        like OpenSea.
      </p>
      <h3>Roadmap</h3>
      <p>
        The NiftyJewel is where it all begins, but the NiftyQuest continues
        indefinitely. Each project along the way will have a unique roadmap and
        unique community. Each project can stand alone but will ultimately tie
        back into the NiftyQuest, where early supporters receive maximum value
        through ownership of their NiftyJewel. Once a role has been assigned
        with your NiftyJewel you will receive additional information on existing
        projects that are under development. The community and your involvement
        will see these projects through to completion and engage a whole other
        community for each project. Here is a snapshot of projects in the works
        for each category: GAMING Two, connected character based gaming
        projects. A playing card, casino style project. IP COLLECTIONS A
        childrens’ cartoon with a PFP NFT. A PFP with club-based incentives. A
        fun, artistic, meme-styled project. A real-world toy NFT project.
        ARTISTS & ARTISANS A real world tie-in generative art project. A curated
        NFT marketplace. NiftyLabs, an initiative that directs new artists into
        the world of NFTs. AUDIO A first of it’s kind generative music-based art
        project. BUSINESS SUITE NFT sales data NFT project rarities NFT
        marketplace tools NFT Analytics A utility token used for fractionalizing
        assets, stacking, and enhancing the NFT marketplace.
      </p>
      <h3>Who are we? </h3>
      <p>
        Nifty is the brainchild of three best friends who have always shared
        ideas with one another saying that . We invite you to join the
        NiftyQuest with us. Blake Moser - Entrepreneur and Talent Agent Cody B.
        - Healthcare Executive James P. - Award winning songwriter, performer,
        and producer
      </p>
      <h3>Future plans? </h3>
      <p>
        Nifty is all about leveraging and empowering the community to create
        digital asset diversity through action. Accessing our initial launch of
        NiftyJewels will ensure your membership and ability to enhance the NFT
        ecosystem directly.
      </p>
      <br></br>
      {mintLoading ? (
        "Loading.."
      ) : (
        <button id="mintButton" onClick={onMintPressed}>
          Mint NFT
        </button>
      )}

      {/* <button id="burnButton" onClick={onBurnPressed}>
        Burn NFT
      </button>
      <button id="metaButton" onClick={onMetaPressed}>
        MetaList
      </button>
      <button id="uploadButton" onClick={onUploadPressed}>
        Upload
      </button> */}
      <p id="status" style={{ color: "red" }}>
        {status}
      </p>
      <br></br>
      {walletAddress ? (
        <div className="mygallery">
          {metaData.map((meta) => {
            return (
              <Token
                meta={meta}
                burn={onBurnPressed}
                walletAddress={walletAddress}
              />
            );
          })}
        </div>
      ) : (
        ""
      )}
    </div>
  );
};

export default Minter;
